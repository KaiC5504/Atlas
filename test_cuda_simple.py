"""Simple CUDA test for ONNX Runtime"""
import onnxruntime as ort

print("ONNX Runtime version:", ort.__version__)
print("Available providers:", ort.get_available_providers())

# Check if your model file exists and can load with CUDA
import os
model_path = os.path.join(os.environ.get('APPDATA', ''), 'Atlas', 'models', 'audio_event_detector.onnx')

if os.path.exists(model_path):
    print(f"\nTesting model: {model_path}")

    try:
        # Try CPU first
        print("\n1. Testing with CPU...")
        sess_cpu = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
        print("   SUCCESS - Model loads on CPU")
        print("   Provider:", sess_cpu.get_providers())

        # Try CUDA
        print("\n2. Testing with CUDA...")
        cuda_options = {
            'device_id': 0,
            'gpu_mem_limit': 4 * 1024 * 1024 * 1024,
        }

        sess_cuda = ort.InferenceSession(
            model_path,
            providers=[('CUDAExecutionProvider', cuda_options), 'CPUExecutionProvider']
        )

        actual = sess_cuda.get_providers()[0]
        print(f"   Provider used: {actual}")

        if actual == 'CUDAExecutionProvider':
            print("   SUCCESS - CUDA is working!")
        else:
            print(f"   WARNING - Fell back to {actual}")
            print("\n   Your system has:")
            print("   - CUDA 13.0 installed")
            print("   - ONNX Runtime 1.23.2")
            print("\n   Issue: ONNX Runtime 1.23.2 requires CUDA 11.8 or 12.x, not 13.0")
            print("\n   Solutions:")
            print("   1. Install CUDA 12.6: https://developer.nvidia.com/cuda-12-6-0-download-archive")
            print("   2. Or try: pip install --upgrade onnxruntime-gpu (check for newer version)")

    except Exception as e:
        print(f"   ERROR: {e}")
else:
    print(f"\nModel not found at: {model_path}")
    print("Train a model first before testing CUDA!")
