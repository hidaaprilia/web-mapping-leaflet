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

  // Styles: BS HIJAU, SLS BIRU
  function getStyle(feature, layerType, isHighlighted) {
    if (isHighlighted) {
      return {
        color: "#dc2626", // Red-600
        weight: 2.5,
        opacity: 0.95,
        fillColor: "#ef4444",
        fillOpacity: 0.6,
      };
    }

    if (layerType === "bs") {
      // PETA BLOK SENSUS = HIJAU
      return {
        color: "#15803d", // Green-700
        weight: 1.5,
        opacity: 0.85,
        fillColor: "#22c55e", // Green-500
        fillOpacity: 0.28,
      };
    } else if (layerType === "sls") {
      // PETA SLS = BIRU
      return {
        color: "#1d4ed8", // Blue-700
        weight: 1.5,
        opacity: 0.85,
        fillColor: "#3b82f6", // Blue-500
        fillOpacity: 0.28,
      };
    } else {
      // Desa (Overlay batas)
      return {
        color: "#d97706", // Amber
        weight: 2,
        dashArray: "4, 4",
        opacity: 0.9,
        fillColor: "#f59e0b",
        fillOpacity: 0.1,
      };
    }
  }

  function renderGeoJson(geoJsonData, layerType, highlightedIds = new Set(), onFeatureClick = null) {
    mainGeoJsonLayer.clearLayers();

    if (!geoJsonData || !geoJsonData.features || geoJsonData.features.length === 0) {
      return;
    }

    mainGeoJsonLayer = L.geoJSON(geoJsonData, {
      style: function (feature) {
        const id = layerType === "bs" ? String(feature.properties.idbs) : String(feature.properties.idsls);
        const isHigh = highlightedIds.has(id);
        return getStyle(feature, layerType, isHigh);
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        const idLabel = layerType === "bs" ? "IDBS" : "IDSLS";
        const idVal = layerType === "bs" ? p.idbs : p.idsls;
        const namaWilayah = p.nmsls ? `${p.nmsls}` : (p.nmdesa ? `Desa ${p.nmdesa}` : "Wilayah");

        // Tooltip on Hover
        layer.bindTooltip(
          `<strong>${idLabel}:</strong> ${idVal || "-"}<br>` +
          `<strong>Wilayah:</strong> ${namaWilayah}<br>` +
          `<strong>Kecamatan:</strong> ${p.nmkec || "-"}`,
          { sticky: true, opacity: 0.9 }
        );

        // Hover Effect
        layer.on("mouseover", function () {
          layer.setStyle({
            weight: 3,
            fillOpacity: 0.55,
          });
        });

        layer.on("mouseout", function () {
          const isHigh = highlightedIds.has(String(idVal));
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

    // Zoom to fit bounds if features exist
    if (geoJsonData.features.length > 0) {
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
        color: "#b45309",
        weight: 2,
        dashArray: "5, 5",
        fillOpacity: 0,
        opacity: 0.8,
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
      return `
        <div class="popup-header" style="background: #15803d;">
          <h3>Blok Sensus: ${props.kdbs || props.idbs}</h3>
          <p>IDBS: ${props.idbs || "-"}</p>
        </div>
        <div class="popup-body">
          <div class="popup-row"><span class="popup-label">Kecamatan:</span><span class="popup-val">${props.nmkec || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Desa/Kelurahan:</span><span class="popup-val">${props.nmdesa || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">SLS:</span><span class="popup-val">${props.nmsls || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Muatan / KK:</span><span class="popup-val">${props.muatan || props.kk || "0"}</span></div>
          <div class="popup-row"><span class="popup-label">Luas:</span><span class="popup-val">${props.luas ? Number(props.luas).toFixed(2) + " m²" : "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Status Bangunan (BSTT):</span><span class="popup-val">${props.bstt || "-"}</span></div>
        </div>
      `;
    } else {
      return `
        <div class="popup-header" style="background: #1d4ed8;">
          <h3>SLS: ${props.nmsls || props.idsls}</h3>
          <p>IDSLS: ${props.idsls || "-"}</p>
        </div>
        <div class="popup-body">
          <div class="popup-row"><span class="popup-label">Kecamatan:</span><span class="popup-val">${props.nmkec || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Desa/Kelurahan:</span><span class="popup-val">${props.nmdesa || "-"}</span></div>
          <div class="popup-row"><span class="popup-label">Kode SLS:</span><span class="popup-val">${props.kdsls || "-"}</span></div>
        </div>
      `;
    }
  }

  function zoomToFeatureById(idVal, layerType) {
    let found = false;
    mainGeoJsonLayer.eachLayer(function (layer) {
      const p = layer.feature.properties;
      const id = layerType === "bs" ? String(p.idbs) : String(p.idsls);
      if (id === String(idVal)) {
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
