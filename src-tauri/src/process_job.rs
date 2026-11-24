//! Shared Windows child-process job; OS closes it when the player exits.
use std::ffi::c_void;
use std::os::windows::io::AsRawHandle;
use std::process::Child;
use std::sync::OnceLock;

const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
const PROCESS_TERMINATE: u32 = 0x0001;

#[repr(C)]
#[derive(Default, Copy, Clone)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[repr(C)]
#[derive(Default, Copy, Clone)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[repr(C)]
#[derive(Default, Copy, Clone)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

extern "system" {
    fn CreateJobObjectW(lpJobAttributes: *const c_void, lpName: *const u16) -> *mut c_void;
    fn SetInformationJobObject(
        hJob: *mut c_void,
        JobObjectInformationClass: u32,
        lpJobObjectInformation: *const c_void,
        cbJobObjectInformationLength: u32,
    ) -> i32;
    fn AssignProcessToJobObject(hJob: *mut c_void, hProcess: *mut c_void) -> i32;
    fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut c_void;
    fn TerminateProcess(hProcess: *mut c_void, uExitCode: u32) -> i32;
    fn CloseHandle(hObject: *mut c_void) -> i32;
}

static JOB_HANDLE: OnceLock<usize> = OnceLock::new();

fn get_or_init_job() -> Option<*mut c_void> {
    // SAFETY: Win32 layouts above match the native ABI. The anonymous job is
    // configured before publication and its handle stays live until process exit.
    let raw = *JOB_HANDLE.get_or_init(|| unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return 0;
        }
        let mut info = JobObjectExtendedLimitInformation::default();
        info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            job,
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
            &info as *const _ as *const c_void,
            std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
        );
        if ok == 0 {
            CloseHandle(job);
            return 0;
        }
        job as usize
    });
    if raw == 0 {
        None
    } else {
        Some(raw as *mut c_void)
    }
}

pub fn assign_child_to_job(child: &Child) {
    if let Some(job) = get_or_init_job() {
        // SAFETY: job is the process-owned live job handle; Child owns its
        // process handle for this entire call. Neither handle is closed here.
        unsafe {
            let _ = AssignProcessToJobObject(job, child.as_raw_handle());
        }
    }
}

pub fn terminate_pid(pid: u32) {
    // SAFETY: request only termination access, check the returned handle, and
    // close exactly the handle opened by this call.
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if !handle.is_null() {
            let _ = TerminateProcess(handle, 1);
            let _ = CloseHandle(handle);
        }
    }
}
