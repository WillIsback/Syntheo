#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub platform: String,
    pub arch: String,
    pub total_memory_bytes: u64,
    pub os_version: String,
    pub app_version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub build_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

pub struct Misc<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    #[allow(dead_code)]
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Misc<'a, R, M> {
    pub fn get_git_hash(&self) -> String {
        env!("VERGEN_GIT_SHA").to_string()
    }

    pub fn get_device_info(&self, locale: Option<String>) -> DeviceInfo {
        let total_memory_bytes = sysinfo::System::new()
            .map(|mut system| {
                system.refresh_memory();
                system.total_memory()
            })
            .unwrap_or_default();

        DeviceInfo {
            platform: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            total_memory_bytes,
            os_version: sysinfo::System::long_os_version().unwrap_or_default(),
            app_version: self.manager.package_info().version.to_string(),
            build_hash: Some(self.get_git_hash()),
            locale,
        }
    }

    /// Resident set size of the host process. WebKit renders in a separate
    /// process on macOS, so this reflects the Rust side, not the JS heap.
    pub fn get_process_memory_bytes(&self) -> Result<u64, String> {
        let pid = sysinfo::get_current_pid().map_err(|error| error.to_string())?;
        let mut system = sysinfo::System::new().map_err(|error| error.to_string())?;
        system.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::Some(&[pid]),
            false,
            sysinfo::ProcessRefreshKind::nothing().with_memory(),
        );

        system
            .process(pid)
            .map(|process| process.memory())
            .ok_or_else(|| "current process not found".to_string())
    }

    pub fn opinionated_md_to_html(&self, text: impl AsRef<str>) -> Result<String, String> {
        syntheo_buffer::opinionated_md_to_html(text.as_ref()).map_err(|e| e.to_string())
    }
}

pub trait MiscPluginExt<R: tauri::Runtime> {
    fn misc(&self) -> Misc<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> MiscPluginExt<R> for T {
    fn misc(&self) -> Misc<'_, R, Self>
    where
        Self: Sized,
    {
        Misc {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}
