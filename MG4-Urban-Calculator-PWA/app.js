const DEFAULTS={capacity:53.9,consumption:13.2,power:2.4,efficiency:90,price:0.18};
let cfg={...DEFAULTS,...JSON.parse(localStorage.getItem("mg4cfg")||"{}")};

const $=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number(n).toLocaleString("pt-PT",{minimumFractionDigits:d,maximumFractionDigits:d});
const money=n=>"€"+Number(n).toLocaleString("pt-PT",{minimumFractionDigits:2,maximumFractionDigits:2});

function loadCfg(){
  $("cfgCapacity").value=cfg.capacity;$("cfgConsumption").value=cfg.consumption;
  $("cfgPower").value=cfg.power;$("cfgEfficiency").value=cfg.efficiency;$("cfgPrice").value=cfg.price;
}
function saveCfg(){
  cfg={capacity:+$("cfgCapacity").value||DEFAULTS.capacity,consumption:+$("cfgConsumption").value||DEFAULTS.consumption,power:+$("cfgPower").value||DEFAULTS.power,efficiency:+$("cfgEfficiency").value||DEFAULTS.efficiency,price:+$("cfgPrice").value||DEFAULTS.price};
  localStorage.setItem("mg4cfg",JSON.stringify(cfg)); calculate();
}
function timeText(hours){
  const total=Math.max(0,Math.round(hours*60));
  const h=Math.floor(total/60),m=total%60;
  return h?`${h}h ${String(m).padStart(2,"0")}m`:`${m} min`;
}
function calculate(){
  const mode=document.querySelector(".mode.active").dataset.mode;
  const cap=cfg.capacity, cons=cfg.consumption, eff=Math.max(.01,cfg.efficiency/100), power=cfg.power;
  let primaryLabel="",primaryValue="",energy=0,range=0,cost=0;
  if(mode==="charge"){
    const from=Math.min(100,Math.max(0,+$("chargeFrom").value||0)),to=Math.min(100,Math.max(0,+$("chargeTo").value||0));
    const delta=Math.max(0,to-from); energy=cap*delta/100; range=energy/cons*100; cost=energy/eff*cfg.price;
    primaryLabel="TEMPO ESTIMADO"; primaryValue=timeText((energy/eff)/power);
  }else if(mode==="time"){
    const hours=Math.max(0,+$("timeHours").value||0);
    const minutes=Math.min(59,Math.max(0,+$("timeMinutes").value||0));
    const min=hours*60+minutes;
    const from=Math.min(100,Math.max(0,+$("timeFrom").value||0)),p=Math.max(.01,+$("timePower").value||power);
    energy=p*(min/60)*eff; const addedPct=energy/cap*100; const final=Math.min(100,from+addedPct); range=energy/cons*100; cost=(energy/eff)*cfg.price;
    primaryLabel="BATERIA FINAL"; primaryValue=`${fmt(final,0)} %`;
    energy=Math.min(cap*addedPct/100,cap*(100-from)/100);
    $("energyResult").textContent=`${fmt(energy,1)} kWh`;
  }else{
    const bat=Math.min(100,Math.max(0,+$("rangeBattery").value||0)); energy=cap*bat/100; range=energy/cons*100; cost=0;
    primaryLabel="AUTONOMIA ESTIMADA"; primaryValue=`${Math.round(range)} km`;
  }
  $("primaryLabel").textContent=primaryLabel;$("primaryValue").textContent=primaryValue;
  $("energyResult").textContent=`${fmt(energy,1)} kWh`;
  $("rangeResult").textContent=`${Math.round(range)} km`;
  $("costResult").textContent=mode==="range"?"—":money(cost);
  $("timePower").value=$("timePower").value||cfg.power;
}
document.querySelectorAll(".mode").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".mode").forEach(b=>b.classList.remove("active"));btn.classList.add("active");
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));$("panel-"+btn.dataset.mode).classList.add("active");
  if(btn.dataset.mode==="time") $("timePower").value=cfg.power;
  calculate();
}));
document.querySelectorAll("input").forEach(i=>i.addEventListener("input",calculate));
if($("timeMinutes")) $("timeMinutes").addEventListener("blur",()=>{
  $("timeMinutes").value=Math.min(59,Math.max(0,+$("timeMinutes").value||0));
  calculate();
});
$("calculateBtn").addEventListener("click",calculate);
$("settingsBtn").addEventListener("click",()=>{loadCfg();$("settingsDialog").showModal()});
$("saveSettings").addEventListener("click",saveCfg);
document.querySelector(".close").addEventListener("click",()=>$("settingsDialog").close());
document.querySelectorAll("#presets button").forEach(b=>b.addEventListener("click",()=>{$("cfgPower").value=b.dataset.power}));
$("resetBtn").addEventListener("click",()=>{cfg={...DEFAULTS};localStorage.setItem("mg4cfg",JSON.stringify(cfg));loadCfg();calculate()});
loadCfg();calculate();

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js"));
