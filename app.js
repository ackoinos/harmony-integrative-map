/* ==========================================================
   Harmony Integrative Orofacial Health - Provider Finder
   Static, client-side. No server, no database, no API key.
   Provider data lives in providers.json (ships with the site).
   Search + filtering runs entirely in the browser.
   Map tiles: OpenStreetMap via Leaflet (free).
   ========================================================== */

(function () {
    "use strict";

    var map, markerLayer;
    var allProviders = [];
    var markersById = {};

    var searchInput = document.getElementById("search");
    var resultsEl = document.getElementById("results");
    var countEl = document.getElementById("resultCount");

    // Canada-centered default view
    var DEFAULT_CENTER = [56.13, -106.35];
    var DEFAULT_ZOOM = 4;

    function initMap() {
        map = L.map("map", { scrollWheelZoom: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        markerLayer = L.layerGroup().addTo(map);
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function popupHtml(p) {
        var site = "";
        if (p.website) {
            site = '<br><a href="' + escapeHtml(p.website) + '" target="_blank" rel="noopener">Visit website</a>';
        }
        var phone = p.phone ? '<br>' + escapeHtml(p.phone) : "";
        return '<div class="popup-title">' + escapeHtml(p.clinic || p.name) + '</div>' +
               '<div class="popup-body">' +
               escapeHtml(p.address || (p.city + ", " + p.province)) +
               phone + site +
               '</div>';
    }

    function renderMarkers(list) {
        markerLayer.clearLayers();
        markersById = {};
        var bounds = [];

        list.forEach(function (p, idx) {
            if (typeof p.lat !== "number" || typeof p.lng !== "number") return;
            var marker = L.marker([p.lat, p.lng]).addTo(markerLayer);
            // autoPan off: focusMarker() does the centering manually so Leaflet's
            // own pan doesn't fight it.
            marker.bindPopup(popupHtml(p), { autoPan: false });
            markersById[idx] = marker;
            bounds.push([p.lat, p.lng]);
        });

        if (bounds.length === 1) {
            map.setView(bounds[0], 11);
        } else if (bounds.length > 1) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
        } else {
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        }
    }

    function renderList(list) {
        resultsEl.innerHTML = "";

        if (list.length === 0) {
            countEl.textContent = "No providers match your search.";
            var empty = document.createElement("li");
            empty.className = "no-results";
            empty.textContent = "Try a different city, province, or clinic name.";
            resultsEl.appendChild(empty);
            return;
        }

        countEl.textContent = list.length + (list.length === 1 ? " provider" : " providers") + " found";

        list.forEach(function (p, idx) {
            var li = document.createElement("li");
            li.className = "result-item";
            li.setAttribute("data-idx", idx);
            li.innerHTML =
                '<h3>' + escapeHtml(p.clinic || p.name) + '</h3>' +
                (p.name && p.name !== p.clinic ? '<div class="clinic">' + escapeHtml(p.name) + '</div>' : '') +
                '<div class="meta">' + escapeHtml(p.city) + ', ' + escapeHtml(p.province) +
                    (p.phone ? ' &middot; ' + escapeHtml(p.phone) : '') + '</div>' +
                (p.specialty ? '<span class="specialty">' + escapeHtml(p.specialty) + '</span>' : '');

            li.addEventListener("click", function () {
                document.querySelectorAll(".result-item.active").forEach(function (el) {
                    el.classList.remove("active");
                });
                li.classList.add("active");
                var marker = markersById[idx];
                if (marker) {
                    focusMarker(marker);
                }
            });

            resultsEl.appendChild(li);
        });
    }

    // Center the SELECTED location so the pin + its popup sit visually centered.
    // The popup opens above the pin, so centering the pin alone leaves the popup
    // (the real visual weight) up high. Instead we:
    //   1. zoom in first (wait for the zoom to finish so projection math is correct)
    //   2. open the popup and let it render
    //   3. measure the popup's actual height, then center on the midpoint between
    //      the pin and the top of the popup -- so the whole cluster is centered.
    function focusMarker(marker) {
        var targetZoom = Math.max(map.getZoom(), 12);

        function centerOnCluster() {
            marker.openPopup();

            // Wait a frame so the popup is in the DOM and measurable.
            requestAnimationFrame(function () {
                var popup = marker.getPopup();
                var popupHeight = 150; // sensible fallback
                if (popup && popup.getElement()) {
                    popupHeight = popup.getElement().offsetHeight || popupHeight;
                }

                // Pin is at the marker point. Popup rises ~popupHeight above it.
                // Center of the cluster is roughly half the popup height above the pin.
                var pinPoint = map.latLngToContainerPoint(marker.getLatLng());
                var clusterCenterY = pinPoint.y - (popupHeight / 2) - 10;
                var targetPoint = L.point(pinPoint.x, clusterCenterY);
                var targetLatLng = map.containerPointToLatLng(targetPoint);

                map.panTo(targetLatLng, { animate: true });
            });
        }

        if (map.getZoom() !== targetZoom) {
            map.flyTo(marker.getLatLng(), targetZoom, { duration: 0.4 });
            map.once("moveend", centerOnCluster);
        } else {
            map.panTo(marker.getLatLng(), { animate: false });
            centerOnCluster();
        }
    }

    function render(list) {
        renderMarkers(list);
        renderList(list);
    }

    function applySearch() {
        var q = searchInput.value.trim().toLowerCase();
        if (!q) { render(allProviders); return; }

        var filtered = allProviders.filter(function (p) {
            var haystack = [p.name, p.clinic, p.city, p.province, p.address, p.specialty]
                .join(" ").toLowerCase();
            return haystack.indexOf(q) !== -1;
        });
        render(filtered);
    }

    function loadProviders() {
        fetch("providers.json")
            .then(function (res) {
                if (!res.ok) throw new Error("Failed to load providers.json (" + res.status + ")");
                return res.json();
            })
            .then(function (data) {
                allProviders = (data.providers || []).slice().sort(function (a, b) {
                    return (a.clinic || a.name).localeCompare(b.clinic || b.name);
                });
                render(allProviders);
            })
            .catch(function (err) {
                countEl.textContent = "Could not load provider data.";
                console.error(err);
            });
    }

    // Init
    initMap();
    loadProviders();
    searchInput.addEventListener("input", applySearch);
})();
