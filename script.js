window.addEventListener("DOMContentLoaded", () => {
let spots = [];
let startPoints = [];

fetch("spots.json")
  .then((response) => response.json())
  .then((data) => {
    spots = data;
  })
  .catch((error) => console.error("spotsJSON読み込みエラー:", error));

fetch("startpoints.json")
  .then((response) => response.json())
  .then((data) => {
    startPoints = data;
    // 読み込んだ出発地をセレクトボックスに反映
    const selectBox = document.getElementById("start");
    startPoints.forEach((sp) => {
      const option = document.createElement("option");
      option.value = sp.select; // JSONのselectをvalueにする
      option.textContent = sp.name;
      selectBox.appendChild(option);
    });
  })
  .catch((error) => console.error("startpointsJSON読み込みエラー:", error));

// スライダーの値をリアルタイム表示
const sliders = [
  "nature",
  "culture",
  "activity",
  "gourmet",
  "rich",
  "shopping",
];
sliders.forEach((id) => {
  document.getElementById(id).addEventListener("input", (e) => {
    document.getElementById(id + "Val").textContent = e.target.value;
  });
});

const selectors = ["station"];

// 緯度経度から距離を計算（Haversine式）
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半径(km)
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // km
}

// 最短ルートを決める（貪欲法）
function optimizeRoute(spots) {
  //if (spots.length <= 1) return spots;

  const visited = [spots[0]]; // 出発地固定
  const unvisited = spots.slice(1);

  let last, nearest, minDist;

  while (unvisited.length > 0) {
    last = visited[visited.length - 1];
    nearest = null;
    minDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const spot = unvisited[i];
      const d = getDistance(last.lat, last.lng, spot.lat, spot.lng);
      if (d < minDist) {
        minDist = d;
        nearest = spot;
      }
    }

    visited.push(nearest);
    unvisited.splice(unvisited.indexOf(nearest), 1);
  }

  return visited;
}

//距離を簡易的にはかる(orsへの負担軽減)
function estimateTravelTime(distanceKm, mode = "walk") {
  const speed = mode === "walk" ? 4 : mode === "car" ? 30 : 15; // km/h
  const hours = distanceKm / speed;
  return Math.round(hours * 60);
}

//自分のAPIキー
const orsApiKey =
  "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdjODA5OWI0MWQ3MzQ4YTZhNGU5ODE2ZjZlZThiNWIxIiwiaCI6Im11cm11cjY0In0=";

// ORSで移動時間を取得
async function getTravelTimeORS(origin, destination) {
  const body = {
    coordinates: [
      [origin.lng, origin.lat], // ORSは [lng, lat]
      [destination.lng, destination.lat],
    ],
  };

  const response = await fetch(
    "https://api.openrouteservice.org/v2/directions/foot-walking",
    {
      method: "POST",
      headers: {
        Accept: "application/json, application/geo+json",
        "Content-Type": "application/json",
        Authorization: orsApiKey,
      },
      body: JSON.stringify(body),
    }
  );
  const data = await response.json();
  console.log(data);

  if (data.routes && data.routes.length > 0) {
    const durationSec = data.routes[0].summary.duration; // routes 配下の summary
    return Math.round(durationSec / 60); // 分
  } else {
    return null;
  }
}

// コース生成
document.getElementById("generate").addEventListener("click", async () => {
  const loading = document.getElementById("loading");
  loading.style.display = "block";

   let optimized = [];
  
  const totalTimeSelect = document.getElementById("all-time");
  let totalTimeLimit = 240; // デフォルト240分
  let totalMinutes = 0; //トータル観光所要時間
  let spotsNumber = 3; //取り出す観光地数

  const selected = totalTimeSelect.value;
  if (selected === "4") totalTimeLimit = 240;
  else if (selected === "6") totalTimeLimit = 360;
  else if (selected === "8") totalTimeLimit = 480;
  console.log(totalTimeLimit);

  while (totalMinutes <= totalTimeLimit) {
    spotsNumber++;
    totalMinutes = 0; // この行はループ内で毎回リセットすると無限ループになるので注意！

    // スタート地点
    const select = document.getElementById("start").value;
    const prefs = {};
    sliders.forEach((id) => {
      prefs[id] = Number(document.getElementById(id).value);
    });

    const startSpot = startPoints.find((sp) => sp.select === select);
    const startLat = startSpot.lat;
    const startLng = startSpot.lng;
    const penaltyRate = 5;

    // スコア計算
    const ranked = spots
      .map((spot) => {
        let total = 0;
        sliders.forEach((id) => {
          total += (spot.score[id] || 0) * prefs[id];
        });

        const distance = getDistance(startLat, startLng, spot.lat, spot.lng);
        const truthTotal = total - distance * penaltyRate;
        return { ...spot, truthTotal };
      })
      .sort((a, b) => b.truthTotal - a.truthTotal);

    const topSpots = ranked.slice(0, spotsNumber);

    if (startSpot) {
      topSpots.unshift(startSpot);
    }

    optimized = optimizeRoute(topSpots);
    console.log("最適ルート:", optimized);

    // 時間の合計を計算
    totalMinutes = 0; // リセット
    for (let i = 0; i < optimized.length - 1; i++) {
      const spot = optimized[i];
      const next = optimized[i + 1];
      const dist = getDistance(spot.lat, spot.lng, next.lat, next.lng);
      const travelTime = estimateTravelTime(dist, "walk");
      totalMinutes += travelTime + spot.stay;
    }

    console.log("合計時間:", totalMinutes, "分");

    // 上限を超えたらループ終了
    if (totalMinutes > totalTimeLimit) {
      console.log("制限時間を超えたため終了");
      break;
    }
  }

  let html = "<h2>おすすめコース</h2>";

  for (let i = 0; i < optimized.length; i++) {
    const spot = optimized[i];
    html += `<div class="spot-card">
      <div class="spot-card-left">
      <div class="spot-card-highlight">
      <div class="spot-tag">
      <p1>${spot.tag}</p1>
      </div>
      <div class="spot-stay">
      <p2>所要時間${spot.stay}分</p2>
      </div>
      </div>
<h3>${spot.name}</h3>
      <p>${spot.description}</p>
      </div>
      <div class="spot-card-right">
      <img src="${spot.img}" alt="${spot.name}" class="spot-img">
      </div>
      </div>`;
    // 次のスポットまでの移動時間を計算
    if (i < optimized.length - 1) {
      const nextSpot = optimized[i + 1];
      const travelTime = await getTravelTimeORS(spot, nextSpot);
      html += `<div class="travel-divider">
        <div class="line"></div>
        <p class="travel-time">次の観光地まで:約 ${travelTime + "分"}</p>
        </div>`;
    }
  }
  // Leafletマップ初期化（初回のみ）
  let map;
  function initMap() {
    if (!map) {
      map = L.map("map").setView([33.195, 130.017], 12); // 武雄市中心付近
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
    } else {
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
          map.removeLayer(layer);
        }
      });
    }
  }

  // コースを地図に表示
  function showMap(course) {
    initMap();

    const latlngs = [];
    course.forEach((spot, i) => {
      if (spot.lat && spot.lng) {
        const marker = L.marker([spot.lat, spot.lng])
          .addTo(map)
          .bindPopup(`<b>${i + 1}. ${spot.name}</b><br>${spot.description}`);
        latlngs.push([spot.lat, spot.lng]);
      }
    });

    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: "blue" }).addTo(map);
      map.fitBounds(latlngs);
    } else if (latlngs.length === 1) {
      map.setView(latlngs[0], 13);
    }
  }

  showMap(optimized);

  loading.style.display = "none";

  document.getElementById("result").innerHTML = html;
});
}

