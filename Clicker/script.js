const DEFAULT_DATA = {
    coins: 0,
    power: 1,
    auto: 0,
    clicks: 0,
    nick: "Игрок",
    avatar: ""
};

let data = loadData();

function loadData(){
    try{
        const saved = localStorage.getItem("killuaClicker");

        if(saved){
            return {
                ...DEFAULT_DATA,
                ...JSON.parse(saved)
            };
        }
    }catch(error){
        console.error("Ошибка загрузки:", error);
    }

    return {...DEFAULT_DATA};
}

function saveData(){
    localStorage.setItem(
        "killuaClicker",
        JSON.stringify(data)
    );
}

function format(number){
    return Number(number).toLocaleString("ru-RU");
}

function updateAll(){

    const ids = {
        coins: data.coins,
        headerCoins: data.coins,
        power: data.power,
        auto: data.auto,
        clicks: data.clicks,
        profileCoins: data.coins,
        profilePower: data.power,
        profileAuto: data.auto,
        profileName: data.nick
    };

    Object.keys(ids).forEach(id => {

        const element = document.getElementById(id);

        if(!element) return;

        if(id === "profileName"){
            element.textContent = data.nick;
        }else{
            element.textContent = format(ids[id]);
        }

    });

    const avatar = document.getElementById("avatar");

    if(avatar){

        if(data.avatar){
            avatar.innerHTML =
                <img src="${data.avatar}" alt="Аватар">;
        }else{
            avatar.textContent = "👤";
        }
    }

    const nickInput =
        document.getElementById("nick");

    if(nickInput){
        nickInput.value = data.nick;
    }
}

function clickCoin(event){

    data.coins += data.power;
    data.clicks++;

    saveData();
    updateAll();

    createPlus(
        event.clientX,
        event.clientY,
        "+" + format(data.power)
    );
}

function createPlus(x,y,text){

    const element =
        document.createElement("div");

    element.className = "plus";
    element.textContent = text;

    element.style.left = x + "px";
    element.style.top = y + "px";

    document.body.appendChild(element);

    requestAnimationFrame(() => {

        element.style.transform =
            "translateY(-80px)";

        element.style.opacity = "0";

    });

    setTimeout(
        () => element.remove(),
        750
    );
}

function buyPower(amount,cost){

    if(data.coins < cost){

        toast("❌ Недостаточно монет!");
        return;
    }

    data.coins -= cost;
    data.power += amount;

    saveData();
    updateAll();

    toast("⚡ Сила клика улучшена!");
}

function buyAuto(amount,cost){

    if(data.coins < cost){

        toast("❌ Недостаточно монет!");
        return;
    }

    data.coins -= cost;
    data.auto += amount;

    saveData();
    updateAll();

    toast("🤖 Автокликер улучшен!");
}

function saveProfile(){

    const input =
        document.getElementById("nick");

    if(!input) return;

    const value =
        input.value.trim();

    if(!value){

        toast("❌ Введи ник!");
        return;
    }

    data.nick =
        value.substring(0,20);

    saveData();
    updateAll();

    toast("✅ Профиль сохранён!");
}

function uploadAvatar(event){

    const file =
        event.target.files[0];

    if(!file) return;

    if(!file.type.startsWith("image/")){

        toast("❌ Выбери изображение!");
        return;
    }

    const reader =
        new FileReader();

    reader.onload = function(){

        data.avatar =
            reader.result;

        saveData();
        updateAll();

        toast("🖼️ Аватар сохранён!");

    };

    reader.readAsDataURL(file);
}

function resetGame(){

    if(!confirm(
        "Точно удалить весь прогресс?"
    )){
        return;
    }

    data = {...DEFAULT_DATA};

    saveData();
    updateAll();

    toast("🗑️ Прогресс удалён!");
}

function toast(message){

    let element =
        document.getElementById("toast");

    if(!element){

        element =
            document.createElement("div");
element.id = "toast";
        element.className = "toast";

        document.body.appendChild(element);
    }

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer =
        setTimeout(() => {

            element.classList.remove("show");

        },1800);
}

/* Автокликер */

setInterval(() => {

    if(data.auto <= 0) return;

    data.coins += data.auto;

    saveData();
    updateAll();

},1000);

/* Запуск */

document.addEventListener(
    "DOMContentLoaded",
    updateAll
);