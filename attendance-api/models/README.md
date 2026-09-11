Place the ArcFace / MobileFaceNet ONNX model here as:

  arcface_mobile.onnx

The embeddings service loads this path (see ONNX_MODEL_PATH).
Expected input: NCHW float32 [1, 3, 112, 112], values in [-1, 1].
Expected output name: embeddings (512-d vector).

If the file is absent, the API uses a deterministic 512-d image descriptor
suitable for local prototype matching of the same crop. For production 1:N
identification across different photos, provide the ONNX model or set
RECOGNITION_PROVIDER=compreface.
