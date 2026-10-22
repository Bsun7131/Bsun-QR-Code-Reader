/*
Copyright (c) 2026 Bisan Subba.
All rights reserved.
*/

"use strict";

// Elements
const startCameraBtn = document.getElementById("startCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const cameraPreview = document.getElementById("cameraPreview");
const imageInput = document.getElementById("imageInput");

const scanStatus = document.getElementById("scanStatus");
const resultText = document.getElementById("resultText");

const copyBtn = document.getElementById("copyBtn");
const openUrlBtn = document.getElementById("openUrlBtn");
const clearBtn = document.getElementById("clearBtn");

// Camera state
let cameraStream = null;
let scanning = false;
let animationFrameId = null;
let scanSession = 0;

// Canvas used for decoding camera frames
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d", {
    willReadFrequently: true
});

// Update status message
function updateStatus(message) {
    scanStatus.textContent = message;
}

// Check jsQR availability
function isSupported() {
    return typeof window.jsQR === "function" && context !== null;
}

// Recognise website URLs
function getWebsiteUrl(value) {
    try {
        const url = new URL(value.trim());

        if (url.protocol === "https:" || url.protocol === "http:") {
            return url.href;
        }
    } catch {
        return null;
    }

    return null;
}

// Display decoded result
function displayResult(value) {
    resultText.value = value;

    copyBtn.disabled = !value;
    openUrlBtn.disabled = !getWebsiteUrl(value);

    updateStatus("QR code successfully scanned.");
}

// Decode QR code from a canvas
function decodeCanvas(sourceCanvas) {
    const sourceContext = sourceCanvas.getContext("2d", {
        willReadFrequently: true
    });

    if (!sourceContext) {
        throw new Error("Canvas is unavailable.");
    }

    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    if (!width || !height) {
        return null;
    }

    const imageData = sourceContext.getImageData(
        0,
        0,
        width,
        height
    );

    return window.jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        {
            inversionAttempts: "attemptBoth"
        }
    );
}

// Stop camera
function stopCamera() {
    scanning = false;
    scanSession++;

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    cameraPreview.pause();
    cameraPreview.srcObject = null;

    startCameraBtn.disabled = !isSupported();
    stopCameraBtn.disabled = true;
}

// Scan camera frames
function scanCamera(session) {
    if (!scanning || session !== scanSession) {
        return;
    }

    try {
        if (
            cameraPreview.readyState >=
            HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
            const width = cameraPreview.videoWidth;
            const height = cameraPreview.videoHeight;

            if (width > 0 && height > 0) {
                canvas.width = width;
                canvas.height = height;

                context.drawImage(
                    cameraPreview,
                    0,
                    0,
                    width,
                    height
                );

                const result = decodeCanvas(canvas);

                if (result) {
                    displayResult(result.data);
                    stopCamera();
                    return;
                }
            }
        }
    } catch (error) {
        console.error("Camera scanning error:", error);
        stopCamera();
        updateStatus("Unable to scan the camera image.");
        return;
    }

    if (scanning && session === scanSession) {
        animationFrameId = requestAnimationFrame(
            () => scanCamera(session)
        );
    }
}

// Start camera
async function startCamera() {
    if (!isSupported()) {
        updateStatus("QR decoding library is unavailable.");
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        updateStatus(
            "Camera access is unavailable. Try HTTPS or localhost."
        );
        return;
    }

    stopCamera();

    const session = scanSession;

    startCameraBtn.disabled = true;
    updateStatus("Requesting camera permission...");

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: {
                    ideal: "environment"
                }
            },
            audio: false
        });

        if (session !== scanSession) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        cameraStream = stream;
        cameraPreview.srcObject = stream;

        await cameraPreview.play();

        if (session !== scanSession) {
            return;
        }

        scanning = true;
        stopCameraBtn.disabled = false;

        updateStatus(
            "Camera active. Point it towards a QR code."
        );

        scanCamera(session);

    } catch (error) {
        console.error("Camera error:", error);

        stopCamera();

        if (error.name === "NotAllowedError") {
            updateStatus("Camera permission was denied.");
        } else if (error.name === "NotFoundError") {
            updateStatus("No camera was found on this device.");
        } else {
            updateStatus("Unable to start the camera.");
        }
    }
}

// Scan QR code from uploaded image
async function scanImage(file) {
    if (!isSupported()) {
        updateStatus("QR decoding library is unavailable.");
        return;
    }

    stopCamera();

    resultText.value = "";
    copyBtn.disabled = true;
    openUrlBtn.disabled = true;

    if (!file || !file.type.startsWith("image/")) {
        updateStatus("Please select a valid image file.");
        return;
    }

    updateStatus("Scanning selected image...");

    let bitmap = null;

    try {
        bitmap = await createImageBitmap(file);

        canvas.width = bitmap.width;
        canvas.height = bitmap.height;

        context.drawImage(
            bitmap,
            0,
            0,
            bitmap.width,
            bitmap.height
        );

        const result = decodeCanvas(canvas);

        if (result) {
            displayResult(result.data);
        } else {
            updateStatus(
                "No QR code was found in the selected image."
            );
        }

    } catch (error) {
        console.error("Image scanning error:", error);
        updateStatus("Unable to scan the selected image.");
    } finally {
        if (bitmap) {
            bitmap.close();
        }
    }
}

// Copy decoded result
async function copyResult() {
    if (!resultText.value) {
        return;
    }

    try {
        await navigator.clipboard.writeText(resultText.value);
        updateStatus("Result copied to clipboard.");
    } catch {
        resultText.focus();
        resultText.select();

        updateStatus(
            "Automatic copying is unavailable. Press Ctrl+C to copy."
        );
    }
}

// Open website
function openWebsite() {
    const url = getWebsiteUrl(resultText.value);

    if (!url) {
        updateStatus("The result is not a valid website URL.");
        return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
}

// Clear everything
function clearAll() {
    stopCamera();

    resultText.value = "";
    imageInput.value = "";

    copyBtn.disabled = true;
    openUrlBtn.disabled = true;

    updateStatus("Ready to scan a QR code.");
}

// Button events
startCameraBtn.addEventListener("click", startCamera);

stopCameraBtn.addEventListener("click", () => {
    stopCamera();
    updateStatus("Camera stopped.");
});

imageInput.addEventListener("change", event => {
    const file = event.target.files[0];

    if (file) {
        scanImage(file);
    }
});

copyBtn.addEventListener("click", copyResult);
openUrlBtn.addEventListener("click", openWebsite);
clearBtn.addEventListener("click", clearAll);

// Stop camera when leaving the page
window.addEventListener("pagehide", stopCamera);

// Check library availability
if (!isSupported()) {
    updateStatus(
        "QR decoding library could not be loaded."
    );

    startCameraBtn.disabled = true;
    imageInput.disabled = true;
}