window.addEventListener("DOMContentLoaded", () => {
  let spots = [];
  let startPoints = [];
  let orsData;
  let optimized = [];
  let coords=[];
  let latlngs=[];

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
    "art",
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

    const start = [origin.lng,origin.lat];
    const end = [destination.lng,destination.lat];

    const response = await fetch(
      `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${orsApiKey}&start=${start}&end=${end}`
    );

    orsData = await response.json();
    console.log("データ", orsData);
    coords = orsData.features[0].geometry.coordinates;
    latlngs.push(coords.map(coord => [coord[1], coord[0]]));

    if (orsData.features) {
      const durationSec = orsData.features[0].properties.summary.duration;
      return Math.round(durationSec / 60); // 分
    } else {
      return;
    }
  }

  // コース生成
  document.getElementById("generate").addEventListener("click", async () => {
    const loading = document.getElementById("loading");
    loading.style.display = "block";

    const totalTimeSelect = document.getElementById("all-time");
    let totalTimeLimit = 240; // デフォルト240分
    let totalMinutes = 0; //トータル観光所要時間
    let spotsNumber = 3; //取り出す観光地数

    const selected = totalTimeSelect.value;
    if (selected === "4") totalTimeLimit = 210;
    else if (selected === "6") totalTimeLimit = 330;
    else if (selected === "8") totalTimeLimit = 450;
    console.log(totalTimeLimit);

    let totalBudget = 0;

    while (totalMinutes <= totalTimeLimit) {
      spotsNumber++;
      totalMinutes = 0;
      totalBudget = 0;

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

      console.log(topSpots);

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

      totalBudget = optimized.reduce(function (sum, spot) {
        return sum + (spot.budget || 0);
      }, 0);

      // 上限を超えたらループ終了
      if (totalMinutes > totalTimeLimit) {
        console.log("制限時間を超えたため終了");
        break;
      }
    }

    let html = "<h2>おすすめコース</h2>";
    html += "<h2>COURSE</h2>";

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    html += `<div class="total-summary">
    <h3>合計予算：${totalBudget}円</h3>
    <h3>合計所要時間：${hours}時間${minutes}分</h3>
    </div>`;

    for (let i = 0; i < optimized.length; i++) {
      const spot = optimized[i];
      html += `<div class="spot-card">
      <div class="spot-card-left">
      <div class="spot-card-highlight">
      <div class="spot-tag">
      <p1>${spot.tag}</p1>
      </div>
      <div class="spot-stay">
      <p2>観光時間${spot.stay}分</p2>
      </div>
      </div>
      <h3 class="spotname">${spot.name}</h3>
      <p>${spot.description}</p>
      <p>住所：${spot.address}</p>
      <p>電話番号：${spot.tel}</p> 
      <p>予算：${spot.budget}円</p> 
      <p>${spot.attention}</p>
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

    //map生成↓

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

      
      
      console.log(coords);
      
      course.forEach((spot, i) => {
        const marker = L.marker([spot.lat, spot.lng])
          .addTo(map)
          .bindPopup(`<b>${i + 1}. ${spot.name}</b><br>${spot.description}`);
        coords = orsData.features[0].geometry.coordinates;
        latlngs.push(coords.map(coord => [coord[1], coord[0]]));
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
});
