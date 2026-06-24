from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Literal

TENSOR_FLOAT = 1
TENSOR_INT64 = 7
IR_VERSION = 8
OPSET_VERSION = 13

ShapeDimension = int | str


def mock_identity_model(
    *,
    graph_name: str,
    input_name: str,
    output_name: str,
    elem_type: int = TENSOR_FLOAT,
    shape: tuple[ShapeDimension, ...] = (1, 4),
) -> bytes:
    """Build a minimal ONNX Identity graph for deterministic CI smoke tests."""
    return _model(
        graph_name=graph_name,
        nodes=[
            _node(
                name=f"{graph_name}-identity",
                op_type="Identity",
                inputs=[input_name],
                outputs=[output_name],
            )
        ],
        inputs=[_value_info(input_name, elem_type, shape)],
        outputs=[_value_info(output_name, elem_type, shape)],
    )


def mock_add_model(
    *,
    graph_name: str,
    left_input_name: str,
    right_input_name: str,
    output_name: str,
    elem_type: int = TENSOR_FLOAT,
    shape: tuple[ShapeDimension, ...] = (1, 4),
) -> bytes:
    """Build a minimal ONNX Add graph for deterministic CI smoke tests."""
    return _model(
        graph_name=graph_name,
        nodes=[
            _node(
                name=f"{graph_name}-add",
                op_type="Add",
                inputs=[left_input_name, right_input_name],
                outputs=[output_name],
            )
        ],
        inputs=[
            _value_info(left_input_name, elem_type, shape),
            _value_info(right_input_name, elem_type, shape),
        ],
        outputs=[_value_info(output_name, elem_type, shape)],
    )


def mock_encoder_cache_model(
    *,
    graph_name: str,
    feature_input_name: str,
    cache_input_name: str,
    encoded_output_name: str,
    cache_output_name: str,
    elem_type: int = TENSOR_FLOAT,
    shape: tuple[ShapeDimension, ...] = (1, 4),
) -> bytes:
    """Build a minimal encoder graph that carries recurrent cache state."""
    return _model(
        graph_name=graph_name,
        nodes=[
            _node(
                name=f"{graph_name}-add-cache",
                op_type="Add",
                inputs=[feature_input_name, cache_input_name],
                outputs=[encoded_output_name],
            ),
            _node(
                name=f"{graph_name}-cache-out",
                op_type="Identity",
                inputs=[encoded_output_name],
                outputs=[cache_output_name],
            ),
        ],
        inputs=[
            _value_info(feature_input_name, elem_type, shape),
            _value_info(cache_input_name, elem_type, shape),
        ],
        outputs=[
            _value_info(encoded_output_name, elem_type, shape),
            _value_info(cache_output_name, elem_type, shape),
        ],
    )


def generate_mock_graphs(output_dir: Path) -> dict[str, Path]:
    """Write the repository's tiny mock RNN-T component graphs."""
    output_dir.mkdir(parents=True, exist_ok=True)
    graphs = {
        "encoder": mock_encoder_cache_model(
            graph_name="mock-encoder",
            feature_input_name="features",
            cache_input_name="encoder_cache_in",
            encoded_output_name="encoded",
            cache_output_name="encoder_cache_out",
        ),
        "predictor": mock_identity_model(
            graph_name="mock-predictor",
            input_name="tokens",
            output_name="predicted",
        ),
        "joiner": mock_add_model(
            graph_name="mock-joiner",
            left_input_name="encoded",
            right_input_name="predicted",
            output_name="logits",
        ),
    }
    paths: dict[str, Path] = {}
    for name, model_bytes in graphs.items():
        path = output_dir / f"{name}.onnx"
        path.write_bytes(model_bytes)
        paths[name] = path
    return paths


def update_manifest_file_entries(manifest_path: Path, file_paths: dict[str, Path]) -> None:
    """Update file sizes/checksums and URLs for generated mock graph artifacts."""
    manifest = json.loads(manifest_path.read_text())
    files = manifest.setdefault("files", {})
    for file_key, path in file_paths.items():
        relative_url = path.relative_to(manifest_path.parent).as_posix()
        model_bytes = path.read_bytes()
        files[file_key] = {
            "url": relative_url,
            "sha256": hashlib.sha256(model_bytes).hexdigest(),
            "sizeBytes": len(model_bytes),
            "mediaType": "application/onnx",
        }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n")


def _model(
    *,
    graph_name: str,
    nodes: list[bytes],
    inputs: list[bytes],
    outputs: list[bytes],
) -> bytes:
    graph = b"".join(_message_field(1, node) for node in nodes)
    graph += _string_field(2, graph_name)
    graph += b"".join(_message_field(11, value_info) for value_info in inputs)
    graph += b"".join(_message_field(12, value_info) for value_info in outputs)

    opset = _int_field(2, OPSET_VERSION)
    model = _int_field(1, IR_VERSION)
    model += _string_field(2, "wilsonle-speech-tools")
    model += _int_field(5, 1)
    model += _message_field(7, graph)
    model += _message_field(8, opset)
    return model


def _node(
    *,
    name: str,
    op_type: Literal["Add", "Identity"],
    inputs: list[str],
    outputs: list[str],
) -> bytes:
    encoded = b"".join(_string_field(1, input_name) for input_name in inputs)
    encoded += b"".join(_string_field(2, output_name) for output_name in outputs)
    encoded += _string_field(3, name)
    encoded += _string_field(4, op_type)
    return encoded


def _value_info(name: str, elem_type: int, shape: tuple[ShapeDimension, ...]) -> bytes:
    tensor_type = _int_field(1, elem_type)
    tensor_type += _message_field(2, _tensor_shape(shape))
    type_proto = _message_field(1, tensor_type)
    return _string_field(1, name) + _message_field(2, type_proto)


def _tensor_shape(shape: tuple[ShapeDimension, ...]) -> bytes:
    encoded = b""
    for dimension in shape:
        if isinstance(dimension, int):
            dim = _int_field(1, dimension)
        else:
            dim = _string_field(2, dimension)
        encoded += _message_field(1, dim)
    return encoded


def _key(field_number: int, wire_type: int) -> bytes:
    return _varint((field_number << 3) | wire_type)


def _int_field(field_number: int, value: int) -> bytes:
    return _key(field_number, 0) + _varint(value)


def _string_field(field_number: int, value: str) -> bytes:
    return _bytes_field(field_number, value.encode())


def _message_field(field_number: int, value: bytes) -> bytes:
    return _bytes_field(field_number, value)


def _bytes_field(field_number: int, value: bytes) -> bytes:
    return _key(field_number, 2) + _varint(len(value)) + value


def _varint(value: int) -> bytes:
    if value < 0:
        raise ValueError("negative varints are not supported by the mock ONNX writer")
    output = bytearray()
    while value >= 0x80:
        output.append((value & 0x7F) | 0x80)
        value >>= 7
    output.append(value)
    return bytes(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate tiny deterministic ONNX mock graphs.")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("model-packs/example-manifest/local-dev-rnnt-mock.json"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("model-packs/example-manifest/files"),
    )
    args = parser.parse_args()

    graph_paths = generate_mock_graphs(args.output_dir)
    update_manifest_file_entries(args.manifest, graph_paths)


if __name__ == "__main__":
    main()
