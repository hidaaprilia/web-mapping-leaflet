/**
 * Map Module for Web Mapping System Tanjung Jabung Barat
 * Handles Leaflet map initialization, basemap switching (including Bing Satellite), layer management, and rendering.
 */

// Custom Bing Satellite Quadkey TileLayer for Leaflet
L.TileLayer.Bing = L.TileLayer.extend({
  getTileUrl: function (coords) {
    let quadKey = "";
    for (let i = coords.z; i > 0; i--) {
      let digit = 0;
      let mask = 1 << (i - 1);
      if ((coords.x & mask) !== 0) digit += 1;
      if ((coords.y & mask) !== 0) digit += 2;
      quadKey += digit;
    }
    const sub = Math.abs(coords.x + coords.y) % 4;
    return `https://ecn.t${sub}.tiles.virtualearth.net/tiles/a${quadKey}.jpeg?g=1`;
  },
});

L.tileLayer.bing = function (options) {
  return new L.TileLayer.Bing("", options);
};

const MapModule = (function () {
  let map;
  let currentBasemap;
  let mainGeoJsonLayer;
  let desaOverlayLayer;
  let highlightLayer;

  // Tanjung Jabung Barat center & bounds
  const INITIAL_CENTER = [-1.09179, 103.10924];
  const INITIAL_ZOOM = 10;

  // Basemap definitions
  const basemaps = {
    googleHybrid: L.tileLayer(
      "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      {
        maxZoom: 20,
        attribution: "&copy; Google Maps",
      }
    ),
    bingSatellite: L.tileLayer.bing({
      maxZoom: 19,
      attribution: "&copy; Microsoft Bing Maps",
    }),
    esriSatellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "&copy; Esri World Imagery",
      }
    ),
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }),
  };

  function initMap(mapElementId) {
    map = L.map(mapElementId, {
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      zoomControl: false,
    });

    // Add Zoom Control at top-right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Add Scale Control
    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

    // Set default basemap: Google Hybrid
    currentBasemap = basemaps.googleHybrid;
    currentBasemap.addTo(map);

    // Initialize layer containers
    mainGeoJsonLayer = L.geoJSON(null).addTo(map);
    desaOverlayLayer = L.geoJSON(null).addTo(map);
    highlightLayer = L.geoJSON(null).addTo(map);

    // Track coordinates on mouse move
    map.on("mousemove", function (e) {
      const coordEl = document.getElementById("coords-display");
      if (coordEl) {
        coordEl.innerText = `Lat: ${e.latlng.lat.toFixed(5)}, Lon: ${e.latlng.lng.toFixed(5)}`;
      }
    });

    return map;
  }

  function setBasemap(key) {
    if (basemaps[key] && map) {
      map.removeLayer(currentBasemap);
      currentBasemap = basemaps[key];
      map.addLayer(currentBasemap);
    }
  }

  // Styles: BS HIJAU (#a3f492), SLS BIRU (#7d95ff), HIGHLIGHT ORANYE (#fda037)
  function getStyle(feature, layerType, isHighlighted) {
    if (isHighlighted) {
      return {
        color: "#fda037", // Oranye terpilih
        weight: 3.5,
        opacity: 1,
        fillColor: "#fda037",
        fillOpacity: 0.7,
      };
    }

    if (layerType === "bs") {
      // PETA BLOK SENSUS = HIJAU (#a3f492)
      return {
        color: "#a3f492",
        weight: 2,
        opacity: 0.95,
        fillColor: "#a3f492",
        fillOpacity: 0.45,
      };
    } else if (layerType === "sls") {
      // PETA SLS = BIRU (#7d95ff)
      return {
        color: "#7d95ff",
        weight: 2,
        opacity: 0.95,
        fillColor: "#7d95ff",
        fillOpacity: 0.45,
      };
    } else {
      // Desa (Overlay batas)
      return {
        color: "#ffd600", // Kuning terang / Gold
        weight: 2,
        dashArray: "4, 4",
        opacity: 1,
        fillColor: "#ffb703",
        fillOpacity: 0.1,
      };
    }
  }

  function renderGeoJson(geoJsonData, layerType, highlightedIds = new Set(), onFeatureClick = null) {
    mainGeoJsonLayer.clearLayers();

    if (!geoJsonData || !geoJsonData.features || geoJsonData.features.length === 0) {
      return;
    }

    const highlightLayers = [];

    mainGeoJsonLayer = L.geoJSON(geoJsonData, {
      style: function (feature) {
        const idBs = String(feature.properties.idbs || "").trim();
        const idSls = String(feature.properties.idsls || "").trim();
        const idSubSls = String(feature.properties.idsubsls || "").trim();

        const isHigh =
          highlightedIds.has(idBs) ||
          highlightedIds.has(idSls) ||
          highlightedIds.has(idSubSls) ||
          (idSubSls && highlightedIds.has(idSubSls.substring(0, 14))) ||
          (idSls && highlightedIds.has(idSls + "00"));

        return getStyle(feature, layerType, isHigh);
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        const idBs = String(p.idbs || "").trim();
        const idSls = String(p.idsls || "").trim();
        const idSubSls = String(p.idsubsls || "").trim();

        const isHigh =
          highlightedIds.has(idBs) ||
          highlightedIds.has(idSls) ||
          highlightedIds.has(idSubSls) ||
          (idSubSls && highlightedIds.has(idSubSls.substring(0, 14))) ||
          (idSls && highlightedIds.has(idSls + "00"));

        if (isHigh) {
          highlightLayers.push(layer);
        }

        const idLabel = layerType === "bs" ? "IDBS" : "IDSLS";
        const idVal = layerType === "bs" ? p.idbs : p.idsls;
        const namaDesa = p.nmdesa || "-";
        const namaKec = p.nmkec || "-";

        let tooltipContent = "";
        if (layerType === "bs") {
          // Untuk peta BS: Label Nama Wilayah
          const namaWilayah = p.nmsls ? `${p.nmsls}` : (p.nmdesa || "Wilayah");
          tooltipContent =
            `<strong>${idLabel}:</strong> ${idVal || "-"}<br>` +
            `<strong>Nama Wilayah:</strong> ${namaWilayah}<br>` +
            `<strong>Nama DESA:</strong> ${namaDesa}<br>` +
            `<strong>Kecamatan:</strong> ${namaKec}`;
        } else {
          // Untuk peta SLS: Label Nama SLS
          const namaSls = p.nmsls || "-";
          tooltipContent =
            `<strong>${idLabel}:</strong> ${idVal || "-"}<br>` +
            `<strong>Nama SLS:</strong> ${namaSls}<br>` +
            `<strong>Nama DESA:</strong> ${namaDesa}<br>` +
            `<strong>Kecamatan:</strong> ${namaKec}`;
        }

        // Tooltip on Hover
        layer.bindTooltip(tooltipContent, { sticky: true, opacity: 0.95 });

        // Hover Effect
        layer.on("mouseover", function () {
          layer.setStyle({
            weight: 3,
            fillOpacity: 0.6,
          });
        });

        layer.on("mouseout", function () {
          layer.setStyle(getStyle(feature, layerType, isHigh));
        });

        // Click Event (Popup + Details)
        layer.on("click", function (e) {
          L.DomEvent.stopPropagation(e);
          const popupContent = createPopupHtml(layerType, p);
          layer.bindPopup(popupContent, { maxWidth: 320 }).openPopup();

          if (onFeatureClick) {
            onFeatureClick(p, feature);
          }
        });
      },
    }).addTo(map);

    // Bring all highlighted polygons to front so they are never hidden under other layers
    highlightLayers.forEach((hl) => {
      try {
        hl.bringToFront();
      } catch (e) {}
    });

    // Zoom to fit bounds if features exist and not specifically handling upload zoom
    if (geoJsonData.features.length > 0 && highlightedIds.size === 0) {
      try {
        const bounds = mainGeoJsonLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
        }
      } catch (err) {
        console.warn("Could not fit bounds:", err);
      }
    }
  }

  function renderDesaOverlay(desaGeoJson, show) {
    desaOverlayLayer.clearLayers();
    if (!show || !desaGeoJson) return;

    desaOverlayLayer = L.geoJSON(desaGeoJson, {
      style: {
        color: "#ffd600",
        weight: 2,
        dashArray: "5, 5",
        fillOpacity: 0,
        opacity: 1,
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        layer.bindTooltip(`Batas Desa: ${p.nmdesa || "-"} (${p.nmkec || "-"})`, {
          sticky: true,
        });
      },
    }).addTo(map);
  }

  function createPopupHtml(layerType, props) {
    if (layerType === "bs") {
      const namaWilayah = props.nmsls ? `${props.nmsls}` : (props.nmdesa || "Wilayah");
      return `
        <div class="popup-header" style="background: linear-gradient(135deg, #064e3b 0%, #059669 100%);">
          <h3>Blok Sensus: ${props.kdbs || props.idbs}</h3>
          <p>IDBS: ${props.idbs || "-"}</p>
        </div>
        <div class="popup-body">
          <div class="popup-row"><span class="popup-label">Nama Wilayah:</span><span class="popup-val">${namaWilayah}</span></div>
          <div class="popup-row"><span class="popup-label">Nama DESA:</span><span class="popup-val">${props.nmdesa || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Kecamatan:</span><span class="popup-val">${props.nmkec || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Muatan / KK:</span><span class="popup-val">${props.muatan || props.kk || "0"}</span></div>
          <div class="popup-row"><span class="popup-label">Luas:</span><span class="popup-val">${props.luas ? Number(props.luas).toFixed(2) + " m²" : "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Status Bangunan:</span><span class="popup-val">${props.bstt || "-"}</span></div>
        </div>
      `;
    } else {
      return `
        <div class="popup-header" style="background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);">
          <h3>SLS: ${props.nmsls || props.idsls}</h3>
          <p>IDSLS: ${props.idsls || "-"}</p>
        </div>
        <div class="popup-body">
          <div class="popup-row"><span class="popup-label">Nama SLS:</span><span class="popup-val">${props.nmsls || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Nama DESA:</span><span class="popup-val">${props.nmdesa || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Kecamatan:</span><span class="popup-val">${props.nmkec || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Kode SLS:</span><span class="popup-val">${props.kdsls || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">ID Sub SLS:</span><span class="popup-val">${props.idsubsls || "-"}</span></div>
        </div>
      `;
    }
  }

  function zoomToFeatureById(idVal, layerType) {
    let found = false;
    mainGeoJsonLayer.eachLayer(function (layer) {
      const p = layer.feature.properties;
      const id = layerType === "bs" ? String(p.idbs) : String(p.idsls);
      const sub = String(p.idsubsls || "");
      if (id === String(idVal) || sub === String(idVal)) {
        found = true;
        map.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [40, 40] });
        layer.openPopup();
      }
    });
    return found;
  }

  function resetView() {
    map.setView(INITIAL_CENTER, INITIAL_ZOOM);
  }

  return {
    initMap,
    setBasemap,
    renderGeoJson,
    renderDesaOverlay,
    zoomToFeatureById,
    resetView,
    getMap: () => map,
  };
})();
