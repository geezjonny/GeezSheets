let database = [];

const FILES = [
    "spells.json",
    "feats.json",
    "conditions.json",
    "equipment.json",
    "magic_items.json"
];

async function loadDatabase(){

    for(const file of FILES){

        const response =
            await fetch("data/" + file);

        const data =
            await response.json();

        const type =
            file.replace(".json","");

        data.forEach(item=>{

            item._type = type;

            database.push(item);
        });
    }

    database.sort((a,b)=>
        a.name.localeCompare(b.name)
    );

    updateResults("");
}

function updateResults(searchText){

    searchText =
        searchText.toLowerCase();

    const results =
        document.getElementById(
            "resultList"
        );

    results.innerHTML = "";

    let matches =
        database.filter(item =>
            item.name
                .toLowerCase()
                .startsWith(searchText)
        );

    if(matches.length === 0){

        matches =
            database.filter(item =>
                item.name
                    .toLowerCase()
                    .includes(searchText)
            );
    }

    matches
        .slice(0,100)
        .forEach(item=>{

            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "result";

            div.textContent =
                item.name;

            div.onclick =
                ()=>showDetails(item);

            results.appendChild(div);
        });
}

function showDetails(item){

    let text = "";

    text += item.name + "\n";
    text += "="
        .repeat(item.name.length);

    text += "\n\n";

    text +=
        "Category: "
        + item._type
        + "\n\n";

    if(item.level !== undefined)
        text +=
            "Level: "
            + item.level
            + "\n";

    if(item.school)
        text +=
            "School: "
            + item.school.name
            + "\n";

    if(item.casting_time)
        text +=
            "Casting Time: "
            + item.casting_time
            + "\n";

    if(item.range)
        text +=
            "Range: "
            + item.range
            + "\n";

    if(item.duration)
        text +=
            "Duration: "
            + item.duration
            + "\n";

    if(item.desc){

        text += "\nDescription\n";
        text +=
            "-----------------\n";

        if(Array.isArray(item.desc))
            text +=
                item.desc.join(
                    "\n\n"
                );
        else
            text += item.desc;
    }

    document
        .getElementById(
            "details"
        )
        .textContent = text;
}

document
.getElementById("searchBox")
.addEventListener(
    "input",
    e=>updateResults(
        e.target.value
    )
);

loadDatabase();