//! Модуль аппаратного анализа видеоадаптера (GPU) через DirectX Graphics Infrastructure (DXGI).

use super::types::GpuHardwareInfo;

/// Очистка наименования GPU в строгий токен для файловых путей и движков (идентично sanitize_token из libaji)
pub fn sanitize_gpu_token(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.chars() {
        if c == ' ' {
            out.push('-');
        } else if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
            out.push(c);
        }
    }
    if out.is_empty() {
        "device0".to_string()
    } else {
        out
    }
}

/// Вычисление мажорного суффикса поколения архитектуры NVIDIA (-sm{major})
/// В libaji имя движка строится через: tok + "-sm" + std::to_string(prop.major).
/// Например: RTX 50xx -> sm12, RTX 40xx/30xx -> sm8, RTX 20xx/16xx -> sm7, GTX 10xx -> sm6.
pub fn determine_nvidia_sm_major(name: &str, sm_arch: &str) -> String {
    if sm_arch.eq_ignore_ascii_case("sm120") {
        return "sm12".to_string();
    }
    if sm_arch.eq_ignore_ascii_case("sm100") {
        return "sm10".to_string();
    }
    if sm_arch.eq_ignore_ascii_case("sm90") {
        return "sm9".to_string();
    }
    if sm_arch.eq_ignore_ascii_case("sm89")
        || sm_arch.eq_ignore_ascii_case("sm86")
        || sm_arch.eq_ignore_ascii_case("sm80")
    {
        return "sm8".to_string();
    }
    if sm_arch.eq_ignore_ascii_case("sm75") {
        return "sm7".to_string();
    }

    // Для универсального ptx определяем точную старшую версию вычислительной архитектуры
    let lower = name.to_lowercase();
    if lower.contains("5090")
        || lower.contains("5080")
        || lower.contains("5070")
        || lower.contains("5060")
        || lower.contains("blackwell")
    {
        return "sm12".to_string();
    }
    if lower.contains("4090")
        || lower.contains("4080")
        || lower.contains("4070")
        || lower.contains("4060")
        || lower.contains("4050")
        || lower.contains("ada")
        || lower.contains("3090")
        || lower.contains("3080")
        || lower.contains("3070")
        || lower.contains("3060")
        || lower.contains("3050")
        || lower.contains("ampere")
        || lower.contains("a100")
    {
        return "sm8".to_string();
    }
    if lower.contains("2080")
        || lower.contains("2070")
        || lower.contains("2060")
        || lower.contains("1660")
        || lower.contains("1650")
        || lower.contains("1630")
        || lower.contains("titan v")
        || lower.contains("v100")
        || lower.contains("volta")
        || lower.contains("turing")
    {
        return "sm7".to_string();
    }
    if lower.contains("1080")
        || lower.contains("1070")
        || lower.contains("1060")
        || lower.contains("1050")
        || lower.contains("1030")
        || lower.contains("titan x")
        || lower.contains("pascal")
        || lower.contains("p1000")
        || lower.contains("p2000")
        || lower.contains("p4000")
        || lower.contains("mx150")
        || lower.contains("mx250")
        || lower.contains("mx350")
    {
        return "sm6".to_string();
    }
    if lower.contains("980")
        || lower.contains("970")
        || lower.contains("960")
        || lower.contains("950")
        || lower.contains("750 ti")
        || lower.contains("maxwell")
    {
        return "sm5".to_string();
    }

    "sm6".to_string()
}

/// Определение архитектуры шейдерных блоков NVIDIA (Streaming Multiprocessors)
pub fn determine_nvidia_sm(name: &str, _device_id: u32) -> String {
    // 1. Запрос точной compute capability через nvidia-smi с сопоставлением видеокарты
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("nvidia-smi");
        cmd.args(["--query-gpu=name,compute_cap", "--format=csv,noheader"]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let out = String::from_utf8_lossy(&output.stdout);
                let mut matched_cap: Option<String> = None;

                let target_name = name.to_lowercase();
                for line in out.lines() {
                    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                    if parts.len() >= 2 {
                        let gpu_line_name = parts[0].to_lowercase();
                        let cap = parts[1];
                        if target_name.contains(&gpu_line_name) || gpu_line_name.contains(&target_name) {
                            matched_cap = Some(cap.to_string());
                            break;
                        }
                    }
                }

                if let Some(cap_str) = matched_cap {
                    let cleaned: String = cap_str
                        .chars()
                        .filter(|c| c.is_ascii_digit())
                        .collect();
                    if !cleaned.is_empty() {
                        let sm = format!("sm{}", cleaned);
                        // Проверяем наличие нативного архитектурного пакета в релизах TensorRT 11
                        match sm.as_str() {
                            "sm120" | "sm100" | "sm90" | "sm89" | "sm86" | "sm80" | "sm75" => {
                                return sm;
                            }
                            _ => {
                                // Для всех прочих (Pascal sm61/sm60, Volta sm70 и др.) используется универсальный ptx
                                return "ptx".to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    let lower = name.to_lowercase();

    // 2. Архитектура Blackwell (RTX 5090, 5080, 5070 Ti, 5070, 5060, 5050 и модификации) -> sm120
    if lower.contains("5090")
        || lower.contains("5080")
        || lower.contains("5070")
        || lower.contains("5060")
        || lower.contains("5050")
        || lower.contains("blackwell")
    {
        return "sm120".to_string();
    }

    // Архитектура Blackwell Datacenter (B100, B200) -> sm100
    if lower.contains("b100") || lower.contains("b200") {
        return "sm100".to_string();
    }

    // Архитектура Hopper (H100, H200, H800) -> sm90
    if lower.contains("h100") || lower.contains("h200") || lower.contains("h800") {
        return "sm90".to_string();
    }

    // Архитектура Ada Lovelace (RTX 40xx, RTX 2000/4000/4500/5000 Ada, L40, L4) -> sm89
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

    // Архитектура Ampere (RTX 30xx, RTX A2000-A6000) -> sm86
    if lower.contains("3090")
        || lower.contains("3080")
        || lower.contains("3070")
        || lower.contains("3060")
        || lower.contains("3050")
        || lower.contains("a2000")
        || lower.contains("a3000")
        || lower.contains("a4000")
        || lower.contains("a4500")
        || lower.contains("a5000")
        || lower.contains("a5500")
        || lower.contains("a6000")
        || lower.contains("ampere")
    {
        return "sm86".to_string();
    }

    // Архитектура Ampere datacenter (A100) -> sm80
    if lower.contains("a100") {
        return "sm80".to_string();
    }

    // Архитектура Turing (RTX 20xx, GTX 16xx, Quadro RTX, T4, T1000/T600/T400) -> sm75
    if lower.contains("2080")
        || lower.contains("2070")
        || lower.contains("2060")
        || lower.contains("1660")
        || lower.contains("1650")
        || lower.contains("1630")
        || lower.contains("titan rtx")
        || lower.contains("quadro rtx")
        || lower.contains("turing")
        || lower.contains(" t4")
        || lower.contains("t1000")
        || lower.contains("t2000")
        || lower.contains("t600")
        || lower.contains("t400")
    {
        return "sm75".to_string();
    }

    // Для Pascal (GTX 10xx, MX, P-series), Volta (Titan V, V100) и других чипов в TRT 11 используется универсальный PTX JIT
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_gpu_token() {
        assert_eq!(
            sanitize_gpu_token("NVIDIA GeForce RTX 5070 Ti"),
            "NVIDIA-GeForce-RTX-5070-Ti"
        );
        assert_eq!(
            sanitize_gpu_token("NVIDIA GeForce RTX 4060 (Notebook)"),
            "NVIDIA-GeForce-RTX-4060-Notebook"
        );
        assert_eq!(
            sanitize_gpu_token("NVIDIA GeForce GTX 1080 with Max-Q Design"),
            "NVIDIA-GeForce-GTX-1080-with-Max-Q-Design"
        );
        assert_eq!(
            sanitize_gpu_token("Intel(R) Arc(TM) A770 Graphics"),
            "IntelR-ArcTM-A770-Graphics"
        );
        assert_eq!(
            sanitize_gpu_token("AMD Radeon RX 7900 XTX"),
            "AMD-Radeon-RX-7900-XTX"
        );
    }

    #[test]
    fn test_sm_architecture_and_major() {
        // Blackwell
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 5090", 0), "sm120");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 5070 Ti", 0), "sm120");
        assert_eq!(determine_nvidia_sm_major("NVIDIA GeForce RTX 5070 Ti", "sm120"), "sm12");

        // Datacenter B100/B200
        assert_eq!(determine_nvidia_sm("NVIDIA B200 Tensor Core GPU", 0), "sm100");
        assert_eq!(determine_nvidia_sm_major("NVIDIA B200", "sm100"), "sm10");

        // Hopper
        assert_eq!(determine_nvidia_sm("NVIDIA H100 80GB HBM3", 0), "sm90");
        assert_eq!(determine_nvidia_sm_major("NVIDIA H100", "sm90"), "sm9");

        // Ada Lovelace (RTX 40xx)
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 4090", 0), "sm89");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 4070 Laptop GPU", 0), "sm89");
        assert_eq!(determine_nvidia_sm("NVIDIA RTX 4000 Ada Generation", 0), "sm89");
        assert_eq!(determine_nvidia_sm_major("NVIDIA GeForce RTX 4090", "sm89"), "sm8");

        // Ampere (RTX 30xx)
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 3080", 0), "sm86");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 3060 Ti", 0), "sm86");
        assert_eq!(determine_nvidia_sm("NVIDIA RTX A4000", 0), "sm86");
        assert_eq!(determine_nvidia_sm_major("NVIDIA GeForce RTX 3080", "sm86"), "sm8");

        // Ampere datacenter (A100)
        assert_eq!(determine_nvidia_sm("NVIDIA A100-PCIE-40GB", 0), "sm80");
        assert_eq!(determine_nvidia_sm_major("NVIDIA A100", "sm80"), "sm8");

        // Turing (RTX 20xx, GTX 16xx)
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce RTX 2080 Ti", 0), "sm75");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce GTX 1660 SUPER", 0), "sm75");
        assert_eq!(determine_nvidia_sm("Quadro RTX 4000", 0), "sm75");
        assert_eq!(determine_nvidia_sm_major("NVIDIA GeForce RTX 2080 Ti", "sm75"), "sm7");

        // Pascal (GTX 10xx) -> ptx, sm6
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce GTX 1080 Ti", 0), "ptx");
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce GTX 1060 6GB", 0), "ptx");
        assert_eq!(determine_nvidia_sm_major("NVIDIA GeForce GTX 1080 Ti", "ptx"), "sm6");
        assert_eq!(determine_nvidia_sm_major("NVIDIA GeForce GTX 1060 6GB", "ptx"), "sm6");

        // Volta -> ptx, sm7
        assert_eq!(determine_nvidia_sm("NVIDIA TITAN V", 0), "ptx");
        assert_eq!(determine_nvidia_sm_major("NVIDIA TITAN V", "ptx"), "sm7");

        // Maxwell -> ptx, sm5
        assert_eq!(determine_nvidia_sm("NVIDIA GeForce GTX 980", 0), "ptx");
        assert_eq!(determine_nvidia_sm_major("NVIDIA GeForce GTX 980", "ptx"), "sm5");
    }
}
