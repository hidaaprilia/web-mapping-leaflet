/**
 * Main Application Logic for Web Mapping System — BPS Tanjung Jabung Barat
 * Handles data fetching, filtering, Excel/CSV uploads, Excel user database authentication, password management, and survey history.
 */

document.addEventListener("DOMContentLoaded", async function () {
  // Application State
  const state = {
    currentMode: "bs", // 'bs' or 'sls'
    bsData: null,
    slsData: null,
    desaData: null,
    filteredData: null,
    highlightedIds: new Set(),
    showOnlyUploaded: false,
    tableMode: "selected", // 'selected' or 'all'
    selectedKecamatan: "",
    selectedDesa: "",
    searchId: "",
    currentUser: null,
    activeSurveyId: null,
    usersDatabase: [],
  };

  const loadingOverlay = document.getElementById("loading-overlay");
  const loadingStatus = document.getElementById("loading-status");

  // Initialize Map
  MapModule.initMap("map");

  // Check Local Storage for Auth
  initAuth();

  // Load Data and User Database
  try {
    updateLoading("Memuat basis data pengguna (users.xlsx)...");
    await loadUsersDatabase();

    updateLoading("Memuat data spasial batas desa (2026)...");
    const desaRes = await fetch("data/peta_desa_202611507.geojson");
    state.desaData = await desaRes.json();

    updateLoading("Memuat data spasial Blok Sensus (BS)...");
    const bsRes = await fetch("data/peta_bs_202511507.geojson");
    state.bsData = await bsRes.json();

    updateLoading("Memuat data spasial Satuan Lingkungan Setempat (SLS 2026)...");
    const slsRes = await fetch("data/peta_sls_202611507.geojson");
    state.slsData = await slsRes.json();

    hideLoading();
    initUI();
    applyFilter();
    initSurveyHistory();
  } catch (err) {
    console.error("Gagal memuat data:", err);
    if (loadingStatus) {
      loadingStatus.innerHTML = `<span style="color:#ef4444;">Gagal memuat data sistem.<br>Pastikan berkas GeoJSON dan users.xlsx berada di folder data/.</span>`;
    }
  }

  function updateLoading(text) {
    if (loadingStatus) loadingStatus.innerText = text;
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add("hidden");
  }

  // --- Cryptographic SHA-256 Helper (Web Crypto API) ---
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(String(message).trim());
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // --- Password Storage Helpers ---
  function getCustomPasswords() {
    try {
      return JSON.parse(localStorage.getItem("bps_custom_passwords") || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveCustomPassword(key, newHash) {
    const map = getCustomPasswords();
    map[key.toLowerCase()] = newHash;
    localStorage.setItem("bps_custom_passwords", JSON.stringify(map));
  }

  // --- Load Users Database from Excel ---
  async function loadUsersDatabase() {
    const customPass = getCustomPasswords();
    try {
      const res = await fetch("data/users.xlsx");
      const arrayBuffer = await res.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      state.usersDatabase = json.map((row) => {
        const u = String(row.username || "").trim().toLowerCase();
        const nip = String(row.nip_lama || "").trim();
        const fileHash = String(row.password_hash || row.password || "").trim();
        const activeHash = customPass[u] || customPass[nip] || fileHash;

        return {
          username: u,
          nip_lama: nip,
          nama: String(row.nama || "").trim(),
          email: String(row.email || "").trim(),
          role: String(row.role || "Organik BPS 1507").trim(),
          passwordHash: activeHash,
        };
      });
    } catch (err) {
      console.warn("Gagal memuat users.xlsx via fetch, gunakan fallback default:", err);
      // Fallback data jika fetch file lokal terkendala
      state.usersDatabase = [
        {
          username: "adindaizzata",
          nip_lama: "340061620",
          nama: "Adinda Izzata",
          role: "Organik BPS 1507",
          passwordHash: customPass["adindaizzata"] || "e5ed3aced8472761ed200b4eaaf844461adcc9d038cf9208659f31a7f7b69a1b",
        },
        {
          username: "sofiam",
          nip_lama: "340017818",
          nama: "Sofia M.",
          role: "Organik BPS 1507",
          passwordHash: customPass["sofiam"] || "6b17da5c290a3c7e0988716a4f94fc23bc11ec189ca810dc25e9dd33cc929555",
        },
        {
          username: "eksternal.mitra",
          nip_lama: "150700001",
          nama: "Mitra Lapangan",
          role: "Eksternal yang diundang",
          passwordHash: customPass["eksternal.mitra"] || "9d361845bb0e0ffb0870954f676be3905e94b2886f481a54fae8601dfa27f671",
        },
      ];
    }
  }

  // --- Authentication System ---
  function initAuth() {
    const savedUser = localStorage.getItem("bps_web_map_user");
    if (savedUser) {
      try {
        state.currentUser = JSON.parse(savedUser);
      } catch (e) {
        state.currentUser = null;
      }
    }
    updateAuthUI();
  }

  function updateAuthUI() {
    const authInfo = document.getElementById("user-auth-info");
    const authActionBtn = document.getElementById("btn-auth-action");
    const btnChangePass = document.getElementById("btn-change-password-open");
    const lockedCard = document.getElementById("survey-history-locked");
    const unlockedCard = document.getElementById("survey-history-unlocked");
    const badgeAuth = document.getElementById("badge-auth-status");
    const btnOpenSaveModal = document.getElementById("btn-open-save-survey-modal");

    if (state.currentUser) {
      const isOrganik = state.currentUser.role.includes("Organik");
      const badgeClass = isOrganik ? "badge-organik" : "badge-eksternal";
      const badgeLabel = isOrganik ? "ORGANIK 1507" : "EKSTERNAL";

      authInfo.innerHTML = `
        <span class="user-badge ${badgeClass}">${badgeLabel}</span>
        <span style="font-weight:600; font-size:0.75rem;" title="${state.currentUser.email || ''}">${state.currentUser.name}</span>
      `;
      authActionBtn.innerText = "Keluar";
      authActionBtn.className = "btn btn-danger";

      if (btnChangePass) btnChangePass.style.display = "inline-flex";

      if (lockedCard) lockedCard.style.display = "none";
      if (unlockedCard) unlockedCard.style.display = "block";
      if (badgeAuth) {
        badgeAuth.className = "pill-badge pill-badge-success";
        badgeAuth.innerText = isOrganik ? "ORGANIK 1507" : "EKSTERNAL";
      }

      // Organik bisa simpan survei baru, Eksternal mode baca
      if (btnOpenSaveModal) {
        btnOpenSaveModal.style.display = isOrganik ? "block" : "none";
      }

      renderSurveyList();
    } else {
      authInfo.innerHTML = `
        <span style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:0.76rem; color:#f0fdf4;">
          <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#34d399;"></span>
          Portal Petugas
        </span>
      `;
      authActionBtn.innerText = "Masuk";
      authActionBtn.className = "btn btn-secondary";

      if (btnChangePass) btnChangePass.style.display = "none";

      if (lockedCard) lockedCard.style.display = "block";
      if (unlockedCard) unlockedCard.style.display = "none";
      if (badgeAuth) {
        badgeAuth.className = "pill-badge pill-badge-warning";
        badgeAuth.innerText = "LOGIN DIPERLUKAN";
      }
    }
  }

  async function loginUser(inputIdentifier, inputPassword) {
    const errorBox = document.getElementById("login-error-msg");
    errorBox.style.display = "none";

    const cleanInput = inputIdentifier.trim().toLowerCase().replace("@bps.go.id", "");
    const cleanPass = inputPassword.trim();
    const inputHash = await sha256(cleanPass);

    // Match with Excel users database (matching SHA-256 hash or fallback during transition)
    const userMatch = state.usersDatabase.find((u) => {
      const matchIdentity = u.username === cleanInput || u.nip_lama === cleanInput;
      if (!matchIdentity) return false;
      return u.passwordHash === inputHash || u.passwordHash === cleanPass;
    });

    if (userMatch) {
      state.currentUser = {
        name: userMatch.nama,
        username: userMatch.username,
        nip_lama: userMatch.nip_lama,
        email: userMatch.email,
        role: userMatch.role,
        passwordHash: userMatch.passwordHash,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem("bps_web_map_user", JSON.stringify(state.currentUser));
      updateAuthUI();
      document.getElementById("modal-login").classList.remove("open");
    } else {
      errorBox.innerHTML = "Username/NIP Lama atau Kata Sandi salah.<br>Pastikan memasukkan username tanpa @bps.go.id dan password NIP Lama BPS Anda.";
      errorBox.style.display = "block";
    }
  }

  function logoutUser() {
    state.currentUser = null;
    localStorage.removeItem("bps_web_map_user");
    updateAuthUI();
  }

  // --- Survey History Management ---
  function getSurveyHistory() {
    const saved = localStorage.getItem("bps_survey_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }

    // Default Seed Data
    const defaultSeed = [
      {
        id: "surv-1",
        name: "Evaluasi SUSENAS Maret 2026",
        mode: "bs",
        date: "2026-03-12",
        author: "Adinda Izzata (Organik BPS 1507)",
        status: "Selesai",
        notes: "Sampel Blok Sensus terpilih wilayah Tungkal Ilir dan sekitarnya.",
        targetIds: ["1507010001001B", "1507010001002B", "1507010002001B", "1507010003001B"],
      },
      {
        id: "surv-2",
        name: "Pemetaan SLS Prioritas Podes",
        mode: "sls",
        date: "2026-04-05",
        author: "Sofia M. (Organik BPS 1507)",
        status: "Proses",
        notes: "Pengecekan batas SLS pemekaran di Kecamatan Betara.",
        targetIds: ["15070200010001", "15070200010002", "15070200020001"],
      },
    ];
    localStorage.setItem("bps_survey_history", JSON.stringify(defaultSeed));
    return defaultSeed;
  }

  function saveSurveyHistory(surveys) {
    localStorage.setItem("bps_survey_history", JSON.stringify(surveys));
    renderSurveyList();
  }

  function initSurveyHistory() {
    if (state.currentUser) {
      renderSurveyList();
    }
  }

  function renderSurveyList() {
    const container = document.getElementById("survey-list-container");
    if (!container) return;

    const surveys = getSurveyHistory();
    container.innerHTML = "";

    if (surveys.length === 0) {
      container.innerHTML = `<div style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:8px;">Belum ada histori survei tersimpan.</div>`;
      return;
    }

    const isOrganik = state.currentUser && state.currentUser.role.includes("Organik");

    surveys.forEach((surv) => {
      const isCurrentActive = state.activeSurveyId === surv.id;
      const item = document.createElement("div");
      item.className = "survey-item";
      if (isCurrentActive) {
        item.style.borderColor = "var(--primary-color)";
        item.style.backgroundColor = "#eff6ff";
      }

      const badgeClass = surv.status === "Selesai" ? "badge-selesai" : "badge-proses";

      item.innerHTML = `
        <div class="survey-header-row">
          <span class="survey-name">${surv.name}</span>
          <span class="survey-status-badge ${badgeClass}">${surv.status}</span>
        </div>
        <div class="survey-meta">
          <strong>Mode:</strong> ${surv.mode === "bs" ? "Blok Sensus" : "SLS"} | <strong>Target:</strong> ${surv.targetIds ? surv.targetIds.length : 0} Wilayah<br>
          <strong>Tanggal:</strong> ${surv.date} | <strong>Petugas:</strong> ${surv.author}<br>
          <em>${surv.notes || "Tidak ada catatan."}</em>
        </div>
        <div class="survey-actions">
          <button class="btn btn-primary" style="padding: 3px 8px; font-size: 0.72rem; flex: 1;" onclick="window.loadSurvey('${surv.id}')">
            ${isCurrentActive ? "✓ Aktif di Peta" : "Muat ke Peta"}
          </button>
          ${
            isOrganik
              ? `<button class="btn btn-danger" style="padding: 3px 8px; font-size: 0.72rem;" onclick="window.deleteSurvey('${surv.id}')" title="Hapus Histori">🗑️</button>`
              : ""
          }
        </div>
      `;
      container.appendChild(item);
    });
  }

  window.loadSurvey = function (surveyId) {
    const surveys = getSurveyHistory();
    const survey = surveys.find((s) => s.id === surveyId);
    if (!survey) return;

    state.activeSurveyId = survey.id;

    // Switch mode if different
    if (state.currentMode !== survey.mode) {
      switchMode(survey.mode);
    }

    // Set highlighted IDs from survey targets
    state.highlightedIds = new Set(survey.targetIds || []);
    state.tableMode = "selected";

    const uploadInfo = document.getElementById("upload-info");
    if (uploadInfo) {
      uploadInfo.innerHTML = `<strong>Histori Dimuat:</strong> ${survey.name} (${survey.targetIds.length} target). Poligon disorot oranye.`;
      uploadInfo.style.color = "var(--primary-color)";
    }

    applyFilter();
    renderSurveyList();
  };

  window.deleteSurvey = function (surveyId) {
    if (!confirm("Apakah Anda yakin ingin menghapus catatan histori survei ini?")) return;

    let surveys = getSurveyHistory();
    surveys = surveys.filter((s) => s.id !== surveyId);
    if (state.activeSurveyId === surveyId) {
      state.activeSurveyId = null;
      state.highlightedIds.clear();
      applyFilter();
    }
    saveSurveyHistory(surveys);
  };

  // --- UI Setup ---
  function initUI() {
    // Mode Switcher (BS / SLS)
    const btnModeBs = document.getElementById("btn-mode-bs");
    const btnModeSls = document.getElementById("btn-mode-sls");

    btnModeBs.addEventListener("click", () => switchMode("bs"));
    btnModeSls.addEventListener("click", () => switchMode("sls"));

    // Basemap selector (Google Hybrid, Bing Satellite, Esri, OSM)
    const basemapSelect = document.getElementById("basemap-select");
    basemapSelect.addEventListener("change", (e) => {
      MapModule.setBasemap(e.target.value);
    });

    // Desa boundary overlay checkbox
    const chkDesaOverlay = document.getElementById("chk-desa-overlay");
    chkDesaOverlay.addEventListener("change", (e) => {
      MapModule.renderDesaOverlay(state.desaData, e.target.checked);
    });

    // Filter Kecamatan & Desa
    populateKecamatanOptions();
    const selectKec = document.getElementById("filter-kecamatan");
    const selectDesa = document.getElementById("filter-desa");

    selectKec.addEventListener("change", (e) => {
      state.selectedKecamatan = e.target.value;
      populateDesaOptions(state.selectedKecamatan);
      state.selectedDesa = "";
      applyFilter();
    });

    selectDesa.addEventListener("change", (e) => {
      state.selectedDesa = e.target.value;
      applyFilter();
    });

    // Search ID Input
    const inputSearch = document.getElementById("input-search-id");
    inputSearch.addEventListener("input", (e) => {
      state.searchId = e.target.value.trim();
      applyFilter();
    });

    // Reset Filter Button
    document.getElementById("btn-reset-filter").addEventListener("click", resetFilters);

    // Excel / CSV File Upload
    const fileUpload = document.getElementById("file-upload");
    fileUpload.addEventListener("change", handleFileUpload);

    const chkOnlySamples = document.getElementById("chk-only-samples");
    if (chkOnlySamples) {
      chkOnlySamples.addEventListener("change", (e) => {
        state.showOnlyUploaded = e.target.checked;
        applyFilter();
      });
    }

    document.getElementById("btn-clear-upload").addEventListener("click", () => {
      fileUpload.value = "";
      state.highlightedIds.clear();
      state.activeSurveyId = null;
      state.showOnlyUploaded = false;
      state.tableMode = "all";
      if (chkOnlySamples) chkOnlySamples.checked = false;
      const containerOnly = document.getElementById("container-only-samples");
      if (containerOnly) containerOnly.style.display = "none";
      document.getElementById("upload-info").innerText = "Belum ada file diunggah.";
      document.getElementById("upload-info").style.color = "var(--text-muted)";
      renderSurveyList();
      applyFilter();
    });

    // Sidebar Toggle
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebar-toggle-btn");
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });

    // Locate Me Button (GPS)
    document.getElementById("btn-locate-me").addEventListener("click", () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const map = MapModule.getMap();
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            map.setView([lat, lng], 16);
            L.circleMarker([lat, lng], {
              radius: 8,
              fillColor: "#ef4444",
              color: "#fff",
              weight: 2,
              fillOpacity: 0.9,
            }).addTo(map).bindPopup("Lokasi Anda Saat Ini").openPopup();
          },
          (err) => alert("Gagal mendapatkan lokasi GPS: " + err.message)
        );
      } else {
        alert("Geolocation tidak didukung pada browser ini.");
      }
    });

    // Reset View Button
    document.getElementById("btn-reset-view").addEventListener("click", () => {
      MapModule.resetView();
    });

    // Data Table Modal
    const modal = document.getElementById("data-modal");
    document.getElementById("btn-view-table").addEventListener("click", () => {
      // Jika ada target terpilih, prioritaskan mode 'selected'
      if (state.highlightedIds && state.highlightedIds.size > 0) {
        state.tableMode = "selected";
      } else {
        state.tableMode = "all";
      }
      renderDataTable();
      modal.classList.add("open");
    });
    document.getElementById("btn-close-modal").addEventListener("click", () => {
      modal.classList.remove("open");
    });

    const btnTabSelected = document.getElementById("btn-tab-selected-data");
    const btnTabAll = document.getElementById("btn-tab-all-data");
    if (btnTabSelected) {
      btnTabSelected.addEventListener("click", () => {
        state.tableMode = "selected";
        renderDataTable();
      });
    }
    if (btnTabAll) {
      btnTabAll.addEventListener("click", () => {
        state.tableMode = "all";
        renderDataTable();
      });
    }

    // Export CSV Button
    document.getElementById("btn-export-csv").addEventListener("click", exportFilteredCsv);
    document.getElementById("btn-copy-ids").addEventListener("click", copyIdsToClipboard);

    // Auth Buttons & Login Modal
    const modalLogin = document.getElementById("modal-login");
    document.getElementById("btn-auth-action").addEventListener("click", () => {
      if (state.currentUser) {
        logoutUser();
      } else {
        document.getElementById("login-error-msg").style.display = "none";
        modalLogin.classList.add("open");
      }
    });

    const btnLockedLogin = document.getElementById("btn-locked-login");
    if (btnLockedLogin) {
      btnLockedLogin.addEventListener("click", () => {
        document.getElementById("login-error-msg").style.display = "none";
        modalLogin.classList.add("open");
      });
    }

    document.getElementById("btn-close-login").addEventListener("click", () => {
      modalLogin.classList.remove("open");
    });

    document.getElementById("form-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById("login-username").value;
      const passwordInput = document.getElementById("login-password").value;
      await loginUser(usernameInput, passwordInput);
    });

    // --- Change Password Modal ---
    const modalChangePass = document.getElementById("modal-change-password");
    const btnOpenChangePass = document.getElementById("btn-change-password-open");
    const btnCloseChangePass = document.getElementById("btn-close-change-password");
    const formChangePass = document.getElementById("form-change-password");
    const changePassMsg = document.getElementById("change-pass-msg");

    if (btnOpenChangePass) {
      btnOpenChangePass.addEventListener("click", () => {
        if (!state.currentUser) return;
        changePassMsg.style.display = "none";
        formChangePass.reset();
        modalChangePass.classList.add("open");
      });
    }

    if (btnCloseChangePass) {
      btnCloseChangePass.addEventListener("click", () => {
        modalChangePass.classList.remove("open");
      });
    }

    if (formChangePass) {
      formChangePass.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.currentUser) return;

        const oldPass = document.getElementById("old-password").value.trim();
        const newPass = document.getElementById("new-password").value.trim();
        const confirmPass = document.getElementById("confirm-password").value.trim();

        // Validate old password using sha256
        const oldHash = await sha256(oldPass);
        const currentHash = state.currentUser.passwordHash;
        if (oldHash !== currentHash && oldPass !== currentHash) {
          changePassMsg.style.display = "block";
          changePassMsg.style.background = "#fee2e2";
          changePassMsg.style.color = "#b91c1c";
          changePassMsg.style.border = "1px solid #fecaca";
          changePassMsg.innerText = "Kata sandi lama salah!";
          return;
        }

        // Validate new password confirmation
        if (newPass !== confirmPass) {
          changePassMsg.style.display = "block";
          changePassMsg.style.background = "#fee2e2";
          changePassMsg.style.color = "#b91c1c";
          changePassMsg.style.border = "1px solid #fecaca";
          changePassMsg.innerText = "Konfirmasi kata sandi baru tidak cocok!";
          return;
        }

        if (newPass.length < 6) {
          changePassMsg.style.display = "block";
          changePassMsg.style.background = "#fee2e2";
          changePassMsg.style.color = "#b91c1c";
          changePassMsg.style.border = "1px solid #fecaca";
          changePassMsg.innerText = "Kata sandi baru minimal 6 karakter!";
          return;
        }

        // Save new password as SHA-256 hash
        const newHash = await sha256(newPass);
        state.currentUser.passwordHash = newHash;
        saveCustomPassword(state.currentUser.username, newHash);
        saveCustomPassword(state.currentUser.nip_lama, newHash);

        // Update in loaded usersDatabase
        const match = state.usersDatabase.find(
          (u) => u.username === state.currentUser.username || u.nip_lama === state.currentUser.nip_lama
        );
        if (match) {
          match.passwordHash = newHash;
        }

        localStorage.setItem("bps_web_map_user", JSON.stringify(state.currentUser));

        changePassMsg.style.display = "block";
        changePassMsg.style.background = "#dcfce7";
        changePassMsg.style.color = "#15803d";
        changePassMsg.style.border = "1px solid #bbf7d0";
        changePassMsg.innerHTML = "<strong>Berhasil!</strong> Kata sandi Anda telah diperbarui dan dienkripsi.";
        formChangePass.reset();

        setTimeout(() => {
          modalChangePass.classList.remove("open");
        }, 1500);
      });
    }

    // Export Updated Users Excel
    const btnDownloadUpdated = document.getElementById("btn-download-updated-users");
    if (btnDownloadUpdated) {
      btnDownloadUpdated.addEventListener("click", () => {
        if (!state.usersDatabase || state.usersDatabase.length === 0) {
          alert("Data pengguna belum termuat.");
          return;
        }
        const exportRows = state.usersDatabase.map((u) => ({
          username: u.username,
          nip_lama: u.nip_lama,
          nama: u.nama,
          email: u.email,
          role: u.role,
          password_hash: u.passwordHash,
        }));
        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Database_Pengguna");
        XLSX.writeFile(wb, "users_terbaru_BPS_1507.xlsx");
      });
    }

    // Save Survey Modal
    const modalSaveSurvey = document.getElementById("modal-save-survey");
    document.getElementById("btn-open-save-survey-modal").addEventListener("click", () => {
      const activeIds = state.highlightedIds.size > 0 
        ? Array.from(state.highlightedIds)
        : (state.filteredData ? state.filteredData.features.map(f => state.currentMode === 'bs' ? f.properties.idbs : f.properties.idsls) : []);

      const previewBox = document.getElementById("survey-save-preview");
      previewBox.innerHTML = `<strong>Data Tersimpan:</strong> ${activeIds.length} wilayah (${state.currentMode === 'bs' ? 'Blok Sensus' : 'SLS'}).`;
      modalSaveSurvey.classList.add("open");
    });

    document.getElementById("btn-close-save-survey").addEventListener("click", () => {
      modalSaveSurvey.classList.remove("open");
    });

    document.getElementById("form-save-survey").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("survey-input-name").value.trim();
      const status = document.getElementById("survey-input-status").value;
      const notes = document.getElementById("survey-input-notes").value.trim();

      const activeIds = state.highlightedIds.size > 0 
        ? Array.from(state.highlightedIds)
        : (state.filteredData ? state.filteredData.features.map(f => String(state.currentMode === 'bs' ? f.properties.idbs : f.properties.idsls)) : []);

      const newSurvey = {
        id: "surv-" + Date.now(),
        name,
        mode: state.currentMode,
        date: new Date().toISOString().split("T")[0],
        author: state.currentUser ? `${state.currentUser.name} (${state.currentUser.role})` : "Petugas BPS",
        status,
        notes,
        targetIds: activeIds,
      };

      const surveys = getSurveyHistory();
      surveys.unshift(newSurvey);
      saveSurveyHistory(surveys);
      modalSaveSurvey.classList.remove("open");
      alert(`Survei "${name}" berhasil disimpan ke histori!`);
    });
  }

  function switchMode(mode) {
    if (state.currentMode === mode) return;
    state.currentMode = mode;

    document.getElementById("btn-mode-bs").classList.toggle("active", mode === "bs");
    document.getElementById("btn-mode-sls").classList.toggle("active", mode === "sls");

    document.getElementById("search-label").innerText = mode === "bs" ? "Cari IDBS:" : "Cari IDSLS:";
    document.getElementById("input-search-id").placeholder = mode === "bs" ? "Contoh: 1507010001..." : "Contoh: 1507010...";

    populateKecamatanOptions();
    populateDesaOptions("");
    applyFilter();
  }

  function getCurrentRawData() {
    return state.currentMode === "bs" ? state.bsData : state.slsData;
  }

  function populateKecamatanOptions() {
    const rawData = getCurrentRawData();
    const selectKec = document.getElementById("filter-kecamatan");
    selectKec.innerHTML = '<option value="">-- Semua Kecamatan --</option>';

    if (!rawData || !rawData.features) return;

    const kecSet = new Set();
    rawData.features.forEach((f) => {
      if (f.properties && f.properties.nmkec) {
        kecSet.add(f.properties.nmkec.trim());
      }
    });

    const kecList = Array.from(kecSet).sort();
    kecList.forEach((kec) => {
      const opt = document.createElement("option");
      opt.value = kec;
      opt.textContent = kec;
      selectKec.appendChild(opt);
    });
  }

  function populateDesaOptions(selectedKec) {
    const rawData = getCurrentRawData();
    const selectDesa = document.getElementById("filter-desa");
    selectDesa.innerHTML = '<option value="">-- Semua Desa / Kelurahan --</option>';

    if (!rawData || !rawData.features) return;

    const desaSet = new Set();
    rawData.features.forEach((f) => {
      const p = f.properties;
      if (p && p.nmdesa) {
        if (!selectedKec || p.nmkec === selectedKec) {
          desaSet.add(p.nmdesa.trim());
        }
      }
    });

    const desaList = Array.from(desaSet).sort();
    desaList.forEach((desa) => {
      const opt = document.createElement("option");
      opt.value = desa;
      opt.textContent = desa;
      selectDesa.appendChild(opt);
    });
  }

  function applyFilter() {
    const rawData = getCurrentRawData();
    if (!rawData || !rawData.features) return;

    const filteredFeatures = rawData.features.filter((f) => {
      const p = f.properties;
      if (!p) return false;

      // Filter: Hanya tampilkan target terunggah
      if (state.showOnlyUploaded && state.highlightedIds.size > 0) {
        const idBs = String(p.idbs || "").trim();
        const idSls = String(p.idsls || "").trim();
        const idSubSls = String(p.idsubsls || "").trim();
        const isMatched =
          state.highlightedIds.has(idBs) ||
          state.highlightedIds.has(idSls) ||
          state.highlightedIds.has(idSubSls) ||
          (idSubSls && state.highlightedIds.has(idSubSls.substring(0, 14))) ||
          (idSls && state.highlightedIds.has(idSls + "00"));
        if (!isMatched) return false;
      }

      // Kecamatan Filter
      if (state.selectedKecamatan && p.nmkec !== state.selectedKecamatan) {
        return false;
      }

      // Desa Filter
      if (state.selectedDesa && p.nmdesa !== state.selectedDesa) {
        return false;
      }

      // Search ID Filter
      if (state.searchId) {
        const idVal = String(state.currentMode === "bs" ? (p.idbs || "") : (p.idsls || ""));
        const idSub = String(p.idsubsls || "");
        if (!idVal.toLowerCase().includes(state.searchId.toLowerCase()) && !idSub.toLowerCase().includes(state.searchId.toLowerCase())) {
          return false;
        }
      }

      return true;
    });

    state.filteredData = {
      type: "FeatureCollection",
      features: filteredFeatures,
    };

    // Render to map with BS = HIJAU CERAH NEON, SLS = BIRU TERANG CYAN
    MapModule.renderGeoJson(
      state.filteredData,
      state.currentMode,
      state.highlightedIds,
      (props) => {
        showFeatureDetails(props);
      }
    );

    // Update Statistics
    updateStats(filteredFeatures);
  }

  function updateStats(features) {
    const totalCountEl = document.getElementById("stat-total-count");
    const totalMuatanEl = document.getElementById("stat-total-muatan");
    const muatanLabelEl = document.getElementById("stat-muatan-label");
    const wilayahLabelEl = document.getElementById("stat-wilayah-label");

    const hasSelection = state.highlightedIds && state.highlightedIds.size > 0;

    // Jika ada target terpilih/tersorot, hitung statistik dari entitas yang tersorot
    let targetFeatures = features;
    if (hasSelection) {
      const selected = features.filter((f) => {
        const p = f.properties || {};
        const idBs = String(p.idbs || "").trim();
        const idSls = String(p.idsls || "").trim();
        const idSubSls = String(p.idsubsls || "").trim();
        return (
          state.highlightedIds.has(idBs) ||
          state.highlightedIds.has(idSls) ||
          state.highlightedIds.has(idSubSls) ||
          (idSubSls && state.highlightedIds.has(idSubSls.substring(0, 14))) ||
          (idSls && state.highlightedIds.has(idSls + "00"))
        );
      });
      if (selected.length > 0) {
        targetFeatures = selected;
      }
    }

    if (state.currentMode === "bs") {
      if (wilayahLabelEl) {
        wilayahLabelEl.innerText = hasSelection ? "TARGET BS TERPILIH" : "JUMLAH BLOK SENSUS";
      }
      totalCountEl.innerText = targetFeatures.length.toLocaleString("id-ID");

      if (muatanLabelEl) muatanLabelEl.innerText = "TOTAL MUATAN / KK";
      const totalMuatan = targetFeatures.reduce((acc, f) => {
        const val = Number(f.properties.muatan || f.properties.kk || 0);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
      totalMuatanEl.innerText = totalMuatan.toLocaleString("id-ID");
    } else {
      if (wilayahLabelEl) {
        wilayahLabelEl.innerText = hasSelection ? "TARGET SLS TERPILIH" : "TOTAL WILAYAH (IDSUBSLS)";
      }
      const subslsSet = new Set(targetFeatures.map((f) => f.properties && f.properties.idsubsls).filter(Boolean));
      const totalWilayah = subslsSet.size > 0 ? subslsSet.size : targetFeatures.length;
      totalCountEl.innerText = totalWilayah.toLocaleString("id-ID");

      if (muatanLabelEl) muatanLabelEl.innerText = "DESA TERCAKUP";
      const desas = new Set(
        targetFeatures.map((f) => {
          const p = f.properties || {};
          const kdkec = String(p.kdkec || "");
          const kddesa = String(p.kddesa || "");
          if (kdkec && kddesa) return `${kdkec}_${kddesa}`;
          return p.nmdesa;
        }).filter(Boolean)
      );
      totalMuatanEl.innerText = desas.size.toLocaleString("id-ID");
    }
  }

  function showFeatureDetails(props) {
    const detailBox = document.getElementById("selected-feature-box");
    if (!detailBox) return;

    if (state.currentMode === "bs") {
      const namaWilayah = props.nmsls ? `${props.nmsls}` : (props.nmdesa || "Wilayah");
      detailBox.innerHTML = `
        <div style="font-size: 0.8rem; line-height: 1.55;">
          <strong>IDBS:</strong> ${props.idbs || "-"}<br>
          <strong>Nama Wilayah:</strong> ${namaWilayah}<br>
          <strong>Nama DESA:</strong> ${props.nmdesa || "-"}<br>
          <strong>Kecamatan:</strong> ${props.nmkec || "-"}<br>
          <strong>Muatan / KK:</strong> ${props.muatan || props.kk || "0"}<br>
          <strong>Luas:</strong> ${props.luas ? Number(props.luas).toFixed(2) + " m²" : "-"}
        </div>
      `;
    } else {
      const kdSubSls = props.kdsubsls || (props.idsubsls ? props.idsubsls.slice(-2) : "00");
      detailBox.innerHTML = `
        <div style="font-size: 0.8rem; line-height: 1.55;">
          <strong>ID Sub SLS:</strong> ${props.idsubsls || "-"}<br>
          <strong>Kode Sub SLS:</strong> ${kdSubSls}<br>
          <strong>IDSLS:</strong> ${props.idsls || "-"}<br>
          <strong>Kode SLS:</strong> ${props.kdsls || "-"}<br>
          <strong>Nama SLS:</strong> ${props.nmsls || "-"}<br>
          <strong>Nama DESA:</strong> ${props.nmdesa || "-"}<br>
          <strong>Kecamatan:</strong> ${props.nmkec || "-"}
        </div>
      `;
    }
  }

  function resetFilters() {
    state.selectedKecamatan = "";
    state.selectedDesa = "";
    state.searchId = "";
    state.highlightedIds.clear();
    state.activeSurveyId = null;
    state.showOnlyUploaded = false;
    state.tableMode = "all";

    const chkOnly = document.getElementById("chk-only-samples");
    if (chkOnly) chkOnly.checked = false;
    const containerOnly = document.getElementById("container-only-samples");
    if (containerOnly) containerOnly.style.display = "none";

    document.getElementById("filter-kecamatan").value = "";
    document.getElementById("filter-desa").value = "";
    document.getElementById("input-search-id").value = "";
    document.getElementById("file-upload").value = "";
    document.getElementById("upload-info").innerText = "Belum ada file diunggah.";
    document.getElementById("upload-info").style.color = "var(--text-muted)";

    populateDesaOptions("");
    renderSurveyList();
    applyFilter();
    MapModule.resetView();
  }

  // Handle Excel / CSV Upload
  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = evt.target.result;
        let workbook;
        if (file.name.endsWith(".csv")) {
          workbook = XLSX.read(data, { type: "string" });
        } else {
          workbook = XLSX.read(data, { type: "binary", raw: false });
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });

        if (json.length === 0) {
          alert("File kosong!");
          return;
        }

        // Search for column idsubsls, idsls, idbs, etc.
        const sampleRow = json[0];
        const keys = Object.keys(sampleRow);
        let targetCol = keys.find(
          (k) =>
            k.toLowerCase().includes("idsubsls") ||
            k.toLowerCase().includes("idsls") ||
            k.toLowerCase().includes("idbs") ||
            k.toLowerCase().includes("id_sls") ||
            k.toLowerCase().includes("id_bs")
        );

        // Fallback: check column containing values with '1507'
        if (!targetCol) {
          targetCol = keys.find((k) =>
            json.some((row) => String(row[k] || "").trim().startsWith("1507"))
          ) || keys[0];
        }

        const rawUploadedList = [];
        const uploadedSearchSet = new Set();

        json.forEach((row) => {
          let val = String(row[targetCol] || "").trim();
          const idMatch = val.match(/1507\d{10,12}/);
          if (idMatch) {
            val = idMatch[0];
          }
          if (val) {
            rawUploadedList.push(val);
            uploadedSearchSet.add(val);
            // Jika 16 digit ID (subsls), sertakan juga prefix 14 digit idsls
            if (val.length === 16) {
              uploadedSearchSet.add(val.substring(0, 14));
            }
            // Jika 14 digit ID, sertakan juga sufiks '00'
            if (val.length === 14) {
              uploadedSearchSet.add(val + "00");
            }
          }
        });

        // Uji kecocokan di data BS vs SLS untuk auto-switch mode jika diperlukan
        const bsFeatures = state.bsData && state.bsData.features ? state.bsData.features : [];
        const slsFeatures = state.slsData && state.slsData.features ? state.slsData.features : [];

        let bsMatchCount = 0;
        bsFeatures.forEach((f) => {
          const idBs = String(f.properties && f.properties.idbs || "").trim();
          if (uploadedSearchSet.has(idBs)) bsMatchCount++;
        });

        let slsMatchCount = 0;
        slsFeatures.forEach((f) => {
          const p = f.properties || {};
          const idSls = String(p.idsls || "").trim();
          const idSubSls = String(p.idsubsls || "").trim();
          if (
            uploadedSearchSet.has(idSls) ||
            uploadedSearchSet.has(idSubSls) ||
            (idSubSls && uploadedSearchSet.has(idSubSls.substring(0, 14)))
          ) {
            slsMatchCount++;
          }
        });

        // Auto-switch mode berdasarkan kecocokan tertinggi
        if (slsMatchCount > bsMatchCount && state.currentMode !== "sls") {
          switchMode("sls");
        } else if (bsMatchCount > slsMatchCount && state.currentMode !== "bs") {
          switchMode("bs");
        }

        // Ambil fitur pada mode aktif yang cocok
        const activeRawData = getCurrentRawData();
        const matchedIds = new Set();
        const matchedPolygons = [];

        activeRawData.features.forEach((f) => {
          const p = f.properties || {};
          const idBs = String(p.idbs || "").trim();
          const idSls = String(p.idsls || "").trim();
          const idSubSls = String(p.idsubsls || "").trim();

          const isMatch =
            uploadedSearchSet.has(idBs) ||
            uploadedSearchSet.has(idSls) ||
            uploadedSearchSet.has(idSubSls) ||
            (idSubSls && uploadedSearchSet.has(idSubSls.substring(0, 14))) ||
            (idSls && uploadedSearchSet.has(idSls + "00"));

          if (isMatch) {
            if (state.currentMode === "bs") {
              if (idBs) matchedIds.add(idBs);
            } else {
              if (idSls) matchedIds.add(idSls);
              if (idSubSls) matchedIds.add(idSubSls);
              if (idSubSls && idSubSls.length === 16) matchedIds.add(idSubSls.substring(0, 14));
            }
            matchedPolygons.push(f);
          }
        });

        // Masukkan juga seluruh uploaded ID ke state.highlightedIds
        uploadedSearchSet.forEach((id) => matchedIds.add(id));

        state.highlightedIds = matchedIds;
        state.activeSurveyId = null;
        state.tableMode = "selected";

        // Hitung total baris unik sampel yang berhasil cocok
        const uniqueUploaded = Array.from(new Set(rawUploadedList));
        const matchedUploadedCount = uniqueUploaded.filter((uId) => {
          const u14 = uId.length === 16 ? uId.substring(0, 14) : uId;
          return matchedPolygons.some((f) => {
            const p = f.properties || {};
            return (
              String(p.idbs || "").trim() === uId ||
              String(p.idsls || "").trim() === uId ||
              String(p.idsls || "").trim() === u14 ||
              String(p.idsubsls || "").trim() === uId
            );
          });
        }).length;

        const infoEl = document.getElementById("upload-info");
        infoEl.innerHTML = `✓ <strong>${matchedUploadedCount}</strong> dari <strong>${uniqueUploaded.length}</strong> target cocok di peta (Kolom: <code>${targetCol}</code>). Poligon disorot oranye.`;
        infoEl.style.color = "#15803d";

        const containerOnlySamples = document.getElementById("container-only-samples");
        if (containerOnlySamples) {
          containerOnlySamples.style.display = "flex";
        }

        applyFilter();

        // Otomatis zoom ke poligon target sampel yang cocok
        if (matchedPolygons.length > 0) {
          try {
            const tempGeoJson = L.geoJSON({ type: "FeatureCollection", features: matchedPolygons });
            const bounds = tempGeoJson.getBounds();
            if (bounds.isValid()) {
              MapModule.getMap().fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            }
          } catch (e) {
            console.warn("Fit bounds error:", e);
          }
        }
      } catch (err) {
        console.error("Gagal membaca file upload:", err);
        alert("Gagal memproses file Excel/CSV: " + err.message);
      }
    };

    if (file.name.endsWith(".csv")) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  }

  // Helper to get features for table and export according to selection mode
  function getFeaturesForTable() {
    const allFiltered = state.filteredData ? state.filteredData.features : [];
    const hasSelection = state.highlightedIds && state.highlightedIds.size > 0;

    if (hasSelection && state.tableMode === "selected") {
      return allFiltered.filter((f) => {
        const p = f.properties || {};
        const idBs = String(p.idbs || "").trim();
        const idSls = String(p.idsls || "").trim();
        const idSubSls = String(p.idsubsls || "").trim();
        return (
          state.highlightedIds.has(idBs) ||
          state.highlightedIds.has(idSls) ||
          state.highlightedIds.has(idSubSls) ||
          (idSubSls && state.highlightedIds.has(idSubSls.substring(0, 14))) ||
          (idSls && state.highlightedIds.has(idSls + "00"))
        );
      });
    }

    return allFiltered;
  }

  // Render Table Modal
  function renderDataTable() {
    const tableHeader = document.getElementById("table-header");
    const tableBody = document.getElementById("table-body");
    const tableTitle = document.getElementById("table-title");
    const btnTabSelected = document.getElementById("btn-tab-selected-data");
    const btnTabAll = document.getElementById("btn-tab-all-data");
    const countTabSelected = document.getElementById("count-tab-selected");
    const countTabAll = document.getElementById("count-tab-all");
    const tabContainer = document.getElementById("table-tab-container");

    tableHeader.innerHTML = "";
    tableBody.innerHTML = "";

    const allFiltered = state.filteredData ? state.filteredData.features : [];
    const hasSelection = state.highlightedIds && state.highlightedIds.size > 0;

    const selectedFeatures = hasSelection
      ? allFiltered.filter((f) => {
          const p = f.properties || {};
          const idBs = String(p.idbs || "").trim();
          const idSls = String(p.idsls || "").trim();
          const idSubSls = String(p.idsubsls || "").trim();
          return (
            state.highlightedIds.has(idBs) ||
            state.highlightedIds.has(idSls) ||
            state.highlightedIds.has(idSubSls) ||
            (idSubSls && state.highlightedIds.has(idSubSls.substring(0, 14))) ||
            (idSls && state.highlightedIds.has(idSls + "00"))
          );
        })
      : [];

    if (countTabSelected) countTabSelected.innerText = selectedFeatures.length;
    if (countTabAll) countTabAll.innerText = allFiltered.length;

    // Default mode: jika ada target terpilih, tampilkan target terpilih
    if (hasSelection && (!state.tableMode || state.tableMode === "selected")) {
      state.tableMode = "selected";
    } else if (!hasSelection) {
      state.tableMode = "all";
    }

    if (tabContainer) {
      tabContainer.style.display = hasSelection ? "inline-flex" : "none";
    }

    if (btnTabSelected && btnTabAll) {
      if (state.tableMode === "selected") {
        btnTabSelected.className = "btn btn-primary";
        btnTabAll.className = "btn btn-secondary";
      } else {
        btnTabSelected.className = "btn btn-secondary";
        btnTabAll.className = "btn btn-primary";
      }
    }

    const features = state.tableMode === "selected" ? selectedFeatures : allFiltered;
    const modeLabel = state.currentMode.toUpperCase();

    if (state.tableMode === "selected") {
      tableTitle.innerText = `Data Terpilih: ${features.length} Entitas (${modeLabel})`;
    } else {
      tableTitle.innerText = `Semua Data Terfilter: ${features.length} Entitas (${modeLabel})`;
    }

    if (features.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 18px;">Tidak ada data yang sesuai filter atau pilihan ID.</td></tr>';
      return;
    }

    if (state.currentMode === "bs") {
      tableHeader.innerHTML = `
        <tr>
          <th>No</th>
          <th>IDBS</th>
          <th>Kode BS</th>
          <th>Nama Wilayah</th>
          <th>Kecamatan</th>
          <th>Desa</th>
          <th>Muatan / KK</th>
          <th>Luas (m²)</th>
          <th>Aksi</th>
        </tr>
      `;

      features.slice(0, 500).forEach((f, idx) => {
        const p = f.properties;
        const namaWilayah = p.nmsls ? `${p.nmsls}` : (p.nmdesa || "Wilayah");
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td><strong>${p.idbs || "-"}</strong></td>
          <td>${p.kdbs || "-"}</td>
          <td>${namaWilayah}</td>
          <td>${p.nmkec || "-"}</td>
          <td>${p.nmdesa || "-"}</td>
          <td>${p.muatan || p.kk || "0"}</td>
          <td>${p.luas ? Number(p.luas).toFixed(1) : "-"}</td>
          <td><button class="btn btn-secondary" style="padding:2px 8px;font-size:0.7rem;" onclick="window.zoomToId('${p.idbs}')">Fokus</button></td>
        `;
        tableBody.appendChild(tr);
      });
    } else {
      tableHeader.innerHTML = `
        <tr>
          <th>No</th>
          <th>ID Sub SLS</th>
          <th>Kode Sub SLS</th>
          <th>IDSLS</th>
          <th>Kode SLS</th>
          <th>Nama SLS</th>
          <th>Kecamatan</th>
          <th>Desa</th>
          <th>Aksi</th>
        </tr>
      `;

      features.slice(0, 500).forEach((f, idx) => {
        const p = f.properties;
        const kdSub = p.kdsubsls || (p.idsubsls ? p.idsubsls.slice(-2) : "00");
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td><code>${p.idsubsls || "-"}</code></td>
          <td>${kdSub}</td>
          <td><strong>${p.idsls || "-"}</strong></td>
          <td>${p.kdsls || "-"}</td>
          <td>${p.nmsls || "-"}</td>
          <td>${p.nmkec || "-"}</td>
          <td>${p.nmdesa || "-"}</td>
          <td><button class="btn btn-secondary" style="padding:2px 8px;font-size:0.7rem;" onclick="window.zoomToId('${p.idsubsls || p.idsls}')">Fokus</button></td>
        `;
        tableBody.appendChild(tr);
      });
    }
  }

  // Global helper for Table "Fokus" button
  window.zoomToId = function (id) {
    document.getElementById("data-modal").classList.remove("open");
    MapModule.zoomToFeatureById(id, state.currentMode);
  };

  // Export Filtered Table to CSV
  function exportFilteredCsv() {
    const features = getFeaturesForTable();
    if (features.length === 0) {
      alert("Tidak ada data untuk diekspor!");
      return;
    }

    const dataRows = features.map((f) => {
      const p = f.properties;
      if (state.currentMode === "bs") {
        const namaWilayah = p.nmsls ? `${p.nmsls}` : (p.nmdesa || "Wilayah");
        return {
          IDBS: p.idbs,
          Kode_BS: p.kdbs,
          Nama_Wilayah: namaWilayah,
          Kecamatan: p.nmkec,
          Desa: p.nmdesa,
          Muatan_KK: p.muatan || p.kk,
          Luas: p.luas,
        };
      } else {
        return {
          ID_Sub_SLS: p.idsubsls || "-",
          Kode_Sub_SLS: p.kdsubsls || (p.idsubsls ? p.idsubsls.slice(-2) : "00"),
          IDSLS: p.idsls,
          Kode_SLS: p.kdsls,
          Nama_SLS: p.nmsls,
          Kecamatan: p.nmkec,
          Desa: p.nmdesa,
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    const sheetName = state.tableMode === "selected" ? "Target_Terpilih" : "Data_Terfilter";
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `BPS_Tanjabbar_${state.currentMode.toUpperCase()}_${sheetName}.csv`, {
      bookType: "csv",
    });
  }

  function copyIdsToClipboard() {
    const features = getFeaturesForTable();
    if (features.length === 0) {
      alert("Tidak ada data untuk disalin!");
      return;
    }

    const ids = features
      .map((f) => (state.currentMode === "bs" ? f.properties.idbs : (f.properties.idsubsls || f.properties.idsls)))
      .filter(Boolean);

    navigator.clipboard.writeText(ids.join("\n")).then(() => {
      alert(`${ids.length} ID berhasil disalin ke clipboard!`);
    });
  }
});
