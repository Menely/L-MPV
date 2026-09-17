//! Модуль аппаратного анализа видеоадаптера (GPU) через DirectX Graphics Infrastructure (DXGI).

use super::types::GpuHardwareInfo;

/// Определение архитектуры шейдерных блоков NVIDIA (Streaming Multiprocessors)
pub fn determine_nvidia_sm(name: &str, _device_id: u32) -> String {
    // 1. Попытка запросить точную compute capability через nvidia-smi
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("nvidia-smi");
        cmd.args(["--query-gpu=compute_cap", "--format=csv,noheader"]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let out = String::from_utf8_lossy(&output.stdout);
                if let Some(first_line) = out.lines().next() {
                    let cleaned: String = first_line
                        .chars()
                        .filter(|c| c.is_ascii_digit())
                        .collect();
                    if !cleaned.is_empty() {
                        return format!("sm{}", cleaned);
                    }
                }
            }
        }
    }

    let lower = name.to_lowercase();

    // 2. Архитектура Blackwell (RTX 5090, 5080, 5070 Ti, 5070, 5060 и их модификации) -> sm120
    if lower.contains("5090")
        || lower.contains("5080")
        || lower.contains("5070")
        || lower.contains("5060")
        || lower.contains("5050")
        || lower.contains("blackwell")
    {
        return "sm120".to_string();
    }

    // Архитектура Ada Lovelace (RTX 40xx, L40, L4) -> sm89
    if lower.contains("4090")
        || lower.contains("4080")
        || lower.contains("4070")
        || lower.contains("4060")
        || lower.contains("4050")
        || lower.contains("ada")
        || lower.contains("l40")
        || lower.contains("l4")
    {
        return "sm89".to_string();
    }

    // Архитектура Ampere (RTX 30xx, A-серия кроме A100) -> sm86
    if lower.contains("3090")
        || lower.contains("3080")
        || lower.contains("3070")
        || lower.contains("3060")
        || lower.contains("3050")
        || lower.contains("a2000")
        || lower.contains("a3000")
        || lower.contains("a4000")
        || lower.contains("a5000")
        || lower.contains("a6000")
        || lower.contains("ampere")
    {
        return "sm86".to_string();
    }

    // Архитектура Ampere datacenter (A100) -> sm80
    if lower.contains("a100") {
        return "sm80".to_string();
    }

    // Архитектура Turing (RTX 20xx, GTX 16xx, T4) -> sm75
    if lower.contains("2080")
        || lower.contains("2070")
        || lower.contains("2060")
        || lower.contains("1660")
        || lower.contains("1650")
        || lower.contains("1630")
        || lower.contains("titan rtx")
        || lower.contains("turing")
        || lower.contains(" t4")
    {
        return "sm75".to_string();
    }

    // Архитектура Pascal (GTX 10xx) -> sm61
    if lower.contains("1080")
        || lower.contains("1070")
        || lower.contains("1060")
        || lower.contains("1050")
        || lower.contains("titan x")
        || lower.contains("pascal")
    {
        return "sm61".to_string();
    }

    // Универсальный forward-compatible байт-код PTX для компиляции JIT под любую версию
    "ptx".to_string()
}

use std::sync::OnceLock;

static CACHED_GPU: OnceLock<GpuHardwareInfo> = OnceLock::new();

/// Получение сведений о текущем графическом процессоре системы через DXGI (с кэшированием)
pub fn detect_system_gpu() -> GpuHardwareInfo {
    CACHED_GPU.get_or_init(detect_system_gpu_uncached).clone()
}

fn detect_system_gpu_uncached() -> GpuHardwareInfo {
    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Dxgi::{
            CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_DESC1, DXGI_ADAPTER_FLAG_SOFTWARE,
        };

        let mut best_gpu: Option<GpuHardwareInfo> = None;

        unsafe {
            if let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() {
                let mut i = 0;
                while let Ok(adapter) = factory.EnumAdapters1(i) {
                    let mut desc = DXGI_ADAPTER_DESC1::default();
                    if adapter.GetDesc1(&mut desc).is_ok() {
                        let is_software = (desc.Flags & (DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32)) != 0;
                        let name_len = desc
                            .Description
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(desc.Description.len());
                        let name = String::from_utf16_lossy(&desc.Description[..name_len])
                            .trim()
                            .to_string();
                        let vendor_id = desc.VendorId;
                        let device_id = desc.DeviceId;
                        let vram_bytes = desc.DedicatedVideoMemory as u64;

                        let vendor = match vendor_id {
                            0x10DE => "NVIDIA",
                            0x1002 => "AMD",
                            0x8086 => "Intel",
                            0x1414 => "Microsoft",
                            _ => "Unknown",
                        }
                        .to_string();

                        let supports_tensorrt = vendor_id == 0x10DE;
                        let recommended_backend = if supports_tensorrt {
                            "TensorRT".to_string()
                        } else {
                            "DirectML".to_string()
                        };

                        let sm_architecture = if supports_tensorrt {
                            determine_nvidia_sm(&name, device_id)
                        } else {
                            "ptx".to_string()
                        };

                        let gpu_info = GpuHardwareInfo {
                            name,
                            vendor,
                            vendor_id,
                            device_id,
                            recommended_backend,
                            supports_tensorrt,
                            sm_architecture,
                            vram_bytes,
                        };

                        if !is_software {
                            if let Some(ref current) = best_gpu {
                                if (gpu_info.vendor == "NVIDIA" && current.vendor != "NVIDIA")
                                    || (gpu_info.vendor == current.vendor
                                        && gpu_info.vram_bytes > current.vram_bytes)
                                {
                                    best_gpu = Some(gpu_info);
                                }
                            } else {
                                best_gpu = Some(gpu_info);
                            }
                        } else if best_gpu.is_none() {
                            best_gpu = Some(gpu_info);
                        }
                    }
                    i += 1;
                }
            }
        }

        if let Some(gpu) = best_gpu {
            return gpu;
        }
    }

    GpuHardwareInfo {
        name: "Универсальный GPU".to_string(),
        vendor: "Unknown".to_string(),
        vendor_id: 0,
        device_id: 0,
        recommended_backend: "DirectML".to_string(),
        supports_tensorrt: false,
        sm_architecture: "ptx".to_string(),
        vram_bytes: 0,
    }
}
