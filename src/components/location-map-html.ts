export function buildLocationMapHtml(latitude: number, longitude: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body { height: 100%; margin: 0; padding: 0; background: #F4F1E8; }
  #map { position: absolute; top: 0; right: 0; bottom: 0; left: 0; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  (function () {
    function post(payload) {
      var message = JSON.stringify(payload);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(message);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
    }
    if (!window.L) { post({ type: 'error' }); return; }
    var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([${latitude}, ${longitude}], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    var marker = L.marker([${latitude}, ${longitude}], { draggable: true }).addTo(map);
    var userMarker = null;
    var accuracyCircle = null;

    function emit(latlng, source) {
      post({ type: 'select', latitude: latlng.lat, longitude: latlng.lng, source: source });
    }
    marker.on('dragend', function () { emit(marker.getLatLng(), 'manual_map_selection'); });
    map.on('click', function (event) {
      marker.setLatLng(event.latlng);
      emit(event.latlng, 'manual_map_selection');
    });
    window.setUserLocation = function (lat, lng, accuracy, recenter) {
      var point = [lat, lng];
      if (userMarker) {
        userMarker.setLatLng(point);
      } else {
        userMarker = L.circleMarker(point, {
          radius: 7, color: '#FFFFFF', weight: 3, fillColor: '#1B4332', fillOpacity: 1
        }).addTo(map);
      }
      if (accuracy) {
        if (accuracyCircle) {
          accuracyCircle.setLatLng(point).setRadius(accuracy);
        } else {
          accuracyCircle = L.circle(point, {
            radius: accuracy, color: '#1B4332', weight: 1, opacity: 0.4,
            fillColor: '#1B4332', fillOpacity: 0.08
          }).addTo(map);
        }
      }
      if (recenter) map.setView(point, Math.max(map.getZoom(), 16));
    };
    window.addEventListener('message', function (event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.type === 'setUser') {
          window.setUserLocation(data.latitude, data.longitude, data.accuracy, data.recenter);
        }
      } catch (error) {}
    });
    post({ type: 'ready' });
  })();
</script>
</body>
</html>`;
}
