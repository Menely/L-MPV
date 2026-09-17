import sys
import onnx
from onnxconverter_common import float16

def main():
    if len(sys.argv) < 2:
        sys.exit(1)
        
    p = sys.argv[1]
    try:
        m = onnx.load(p, load_external_data=False)
        # Check if the first input tensor is FP32 (elem_type == 1)
        if m.graph.input and m.graph.input[0].type.tensor_type.elem_type == 1:
            print(f"FP32 detected in {p}. Converting to FP16...")
            m_fp16 = float16.convert_float_to_float16(m, keep_io_types=False)
            onnx.save(m_fp16, p)
            print("Successfully converted to FP16.")
        else:
            print("Not FP32 or no inputs. No conversion needed.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
