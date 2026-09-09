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
            marker.bindPopup(popupHtml(p), {
                autoPan: true,
                autoPanPadding: [40, 60],
                keepInView: true
            });
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

    // Center on a marker and open its popup. Because the popup opens ABOVE the
    // pin, we nudge the map view down by ~90px so the pin sits in the
    // lower-middle and the popup has room. This makes the selected location
    // look centered instead of hidden behind the popup.
    function focusMarker(marker) {
        var targetZoom = Math.max(map.getZoom(), 12);
        var latlng = marker.getLatLng();

        function panAndOpen() {
            var point = map.project(latlng, map.getZoom());
            point.y -= 90; // push the pin down from dead-center
            var adjusted = map.unproject(point, map.getZoom());
            map.panTo(adjusted, { animate: true });
            marker.openPopup();
        }

        if (map.getZoom() !== targetZoom) {
            map.once("zoomend", panAndOpen);
            map.setZoom(targetZoom);
        } else {
            panAndOpen();
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
