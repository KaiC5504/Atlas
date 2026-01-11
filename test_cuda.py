"""Test CUDA availability with ONNX Runtime"""
import onnxruntime as ort
import numpy as np

print("=" * 60)
print("ONNX Runtime CUDA Test")
print("=" * 60)

print(f"\n1. ONNX Runtime version: {ort.__version__}")
print(f"2. Available providers: {ort.get_available_providers()}")

# Try to create a session with CUDA
print("\n3. Testing CUDA provider initialization...")
try:
    # Create simple dummy model
    import tempfile
    import onnx
    from onnx import helper, TensorProto

    # Create a simple model (just a Relu operation)
    input_tensor = helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, 224, 224])
    output_tensor = helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, 224, 224])

    relu_node = helper.make_node('Relu', inputs=['input'], outputs=['output'])
    graph = helper.make_graph([relu_node], 'test_graph', [input_tensor], [output_tensor])
    model = helper.make_model(graph, producer_name='test')

    # Save to temp file
    temp_model = tempfile.NamedTemporaryFile(delete=False, suffix='.onnx')
    onnx.save(model, temp_model.name)
    temp_model.close()

    # Try to load with CUDA
    print("   Attempting to create session with CUDAExecutionProvider...")

    cuda_options = {
        'device_id': 0,
        'arena_extend_strategy': 'kNextPowerOfTwo',
        'gpu_mem_limit': 2 * 1024 * 1024 * 1024,
        'cudnn_conv_algo_search': 'EXHAUSTIVE',
    }

    session = ort.InferenceSession(
        temp_model.name,
        providers=[('CUDAExecutionProvider', cuda_options), 'CPUExecutionProvider']
    )

    actual_provider = session.get_providers()[0]
    print(f"   ✓ Session created successfully!")
    print(f"   Actual provider used: {actual_provider}")

    if actual_provider == 'CUDAExecutionProvider':
        print("\n   ✅ SUCCESS! CUDA is working!")

        # Try a test inference
        input_data = np.random.randn(1, 3, 224, 224).astype(np.float32)
        output = session.run(None, {'input': input_data})
        print(f"   ✓ Test inference successful! Output shape: {output[0].shape}")
    else:
        print(f"\n   ⚠️  WARNING: Fell back to {actual_provider}")
        print("   CUDA is available but cannot be used.")
        print("\n   Possible reasons:")
        print("   - CUDA version mismatch (you have CUDA 13.0, ONNX Runtime needs 11.8 or 12.x)")
        print("   - Missing cuDNN libraries")
        print("   - Incompatible GPU driver")

    # Clean up
    import os
    os.unlink(temp_model.name)

except ImportError as e:
    print(f"   ✗ Missing dependency: {e}")
    print("   Install with: pip install onnx")
except Exception as e:
    print(f"   ✗ Error: {e}")
    print(f"\n   This confirms CUDA cannot initialize properly.")
    print(f"   Likely cause: CUDA 13.0 is not supported by ONNX Runtime {ort.__version__}")

print("\n" + "=" * 60)
print("Recommendation:")
print("  Install CUDA 12.6 (or 11.8) to use GPU acceleration")
print("  Download: https://developer.nvidia.com/cuda-downloads")
print("=" * 60)
