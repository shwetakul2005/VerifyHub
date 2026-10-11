import { useEffect, useMemo, useRef, useState } from "react";

function SelfieCapture({ value, onChange, disabled = false }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState("");
    const previewUrl = useMemo(() => value ? URL.createObjectURL(value) : "", [value]);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraActive(false);
    };

    useEffect(() => () => stopCamera(), []);

    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    const startCamera = async () => {
        setCameraError("");
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("Camera capture is unavailable in this browser. Choose a selfie file instead.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            setCameraActive(true);
        } catch {
            setCameraError("Camera permission was not granted. Choose a selfie file instead.");
        }
    };

    const capture = () => {
        const video = videoRef.current;
        if (!video?.videoWidth) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
            if (!blob) return;
            onChange(new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" }));
            stopCamera();
        }, "image/jpeg", 0.92);
    };

    return (
        <div className="selfie-capture">
            <div className="capture-frame">
                {previewUrl ? (
                    <img src={previewUrl} alt="Selfie preview" />
                ) : (
                    <video ref={videoRef} autoPlay playsInline muted className={cameraActive ? "" : "is-hidden"} />
                )}
                {!previewUrl && !cameraActive && <p>Center one face in even lighting.</p>}
            </div>

            <div className="button-row">
                {!cameraActive && !value && <button type="button" onClick={startCamera} disabled={disabled}>Use camera</button>}
                {cameraActive && <button type="button" onClick={capture} disabled={disabled}>Capture selfie</button>}
                {cameraActive && <button type="button" className="button-secondary" onClick={stopCamera}>Cancel camera</button>}
                {value && <button type="button" className="button-secondary" onClick={() => onChange(null)} disabled={disabled}>Retake</button>}
            </div>

            {!cameraActive && !value && (
                <label className="file-label">
                    Or choose a selfie image
                    <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={(event) => onChange(event.target.files?.[0] || null)}
                        disabled={disabled}
                    />
                </label>
            )}
            {cameraError && <p className="form-error">{cameraError}</p>}
            <p className="field-help">This checks image quality and compares faces. It is not a liveness or anti-spoofing test.</p>
        </div>
    );
}

export default SelfieCapture;
