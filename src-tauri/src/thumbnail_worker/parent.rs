#[cfg(windows)]
pub(super) struct Parent(usize);

#[cfg(windows)]
impl Parent {
    pub fn open(pid: u32) -> Result<Self, String> {
        // SAFETY: request SYNCHRONIZE only and retain this owned process object,
        // so PID reuse cannot keep a worker alive after its real parent exits.
        let handle = unsafe {
            windows::Win32::System::Threading::OpenProcess(
                windows::Win32::System::Threading::PROCESS_ACCESS_RIGHTS(0x0010_0000),
                false,
                pid,
            )
        }
        .map_err(|e| e.to_string())?;
        Ok(Self(handle.0 as usize))
    }
    pub fn alive(&self) -> bool {
        // SAFETY: the process handle remains owned by self; zero timeout never blocks.
        unsafe {
            windows::Win32::System::Threading::WaitForSingleObject(
                windows::Win32::Foundation::HANDLE(self.0 as isize),
                0,
            ) == windows::Win32::Foundation::WAIT_TIMEOUT
        }
    }
}
#[cfg(windows)]
impl Drop for Parent {
    fn drop(&mut self) {
        // SAFETY: close exactly our owned process handle.
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(windows::Win32::Foundation::HANDLE(
                self.0 as isize,
            ));
        }
    }
}
