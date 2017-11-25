let blah = ["name", "image", "quote?", "time", "currency", "xp", "requirements_level?", "requirements_building?", "animated", "requirements_character"];

const http = require("http");
const db = require("./db.js");
const basePath = "/api.php?action=query&format=json&";
const CHARACTERSTABLE = db.CHARACTERSTABLE;

let options = {
    host: "futuramaworldsoftomorrow.gamepedia.com",
    path: `${basePath}list=categorymembers&cmtitle=Category:Characters&cmlimit=max`,
    headers: {
        "Api-User-Agent": "FuturamaWOTApplication/1.1 (http://www.luiscruzgmu.com; luiscruzgmu@gmail.com)"
    }
};
let charactersObj = {};

db.connect();
sendRequest().then(handleCharactersResponse);

function sendRequest(path) {
    return new Promise((resolve, reject) => {
        options.path = path || options.path;
        http.request(options, handleResponse.bind(null, resolve, reject)).end();
    });
}

function handleResponse(resolve, reject, response) {
    let str = "";
    
    //another chunk of data has been recieved, so append it to `str`
    response.on("data", chunk => str += chunk);

    //the whole response has been recieved, so we just print it out here
    response.on("end", () => {
        if (!/DDoS/.test(str)) {
            resolve(str);
        } else {
            reject(str);
            console.log(str);
        }
    });
}

function handleCharactersResponse(str) {
    let obj = JSON.parse(str);
    let charArr = obj.query.categorymembers.map(obj => obj.title).filter(name => {
        return !/:|(?:How to Play)|(?:Characters)/i.test(name);
    });
    
    updateCharactersTable(charArr).then(() => {
        let charArrLen = charArr.length;
        let counter = 0;
        let characterRequestPromises = [];
        let updateUnreleasedArrsObj = {
            caseArr: [],
            nameArr: [],
            valuesArr: []
        };

        while (charArrLen > counter) {
            characterRequestPromises.push(sendRequest(
                `${basePath}prop=revisions&rvprop=content&titles=${encodeURI(charArr.slice(counter, counter + 50).join("|"))}`
            ).then(str => {
                parseCharacterPage(str, updateUnreleasedArrsObj);
            }));
            counter += 50;
        }

        Promise.all(characterRequestPromises).then(() => updateUnreleasedColumn(updateUnreleasedArrsObj));
    });
}

function updateCharactersTable(charArr) {
    return db.runQuery({
        text: `SELECT * FROM ${CHARACTERSTABLE};`
    })
    .then((res) => {
        let dbArr = res.rows.map(row => {
            charactersObj[row.name] = row;
            return row.name;
        });
        let insertsArr = getInsertsArr(dbArr, charArr);
        let deletesArr = getDeletesArr(dbArr, charArr);
        let insertsPromise = null;
        let deletesPromise = null;

        console.log(`${insertsArr.length} new characters to insert`);
        if (insertsArr.length > 0) {
            console.log(insertsArr);
            insertsPromise = db.insertCharacters(insertsArr).then(
                res => console.log(`${res.command} ${res.rowCount} rows into ${CHARACTERSTABLE}`),
                errResponse
            );
        }

        console.log(`${deletesArr.length} characters to delete`);
        if (deletesArr.length > 0) {
            console.log(deletesArr);
            deletesPromise = db.deleteCharacters(deletesArr).then(
                res => console.log(`${res.command} ${res.rowCount} rows from ${CHARACTERSTABLE}`),
                errResponse
            );
        }

        return Promise.all([insertsPromise, deletesPromise]);
    }, errResponse);
}

function parseCharacterPage(str, updateUnreleasedArrsObj) {
    let pages = JSON.parse(str).query.pages;
    let pagesArr = Object.keys(pages).map(key => pages[key]);
    let pagesArrLen = pagesArr.length;

    for (let i = 0; i < pagesArrLen; i++) {
        formatCharacterPage(pagesArr[i].revisions[0]["*"], pagesArr[i].title, updateUnreleasedArrsObj);
    }
}

function formatCharacterPage(rawPage, character, retObj) {
    let unreleased;
    let dbUnreleased = "";

    if (charactersObj[character] && charactersObj[character].unreleased != null) {
        dbUnreleased = charactersObj[character].unreleased ? "TRUE" : "FALSE";
    }

    if (!/unreleased.*?=.*?yes/.test(rawPage)) {
        let regExp = /{{Action(?:\n.*?)*}}/g;
        let actionsArr = rawPage.match(regExp);
        let actionsArrLen = actionsArr.length;
        let formatObjArr = [];
        unreleased = "FALSE";
        for (let i = 0; i < actionsArrLen; i++) {
            let action = actionsArr[i];
            let actionObj = {};
            let keys = action.match(/\|.*?\w+.*?=/g);
            let keysLen = keys.length;

            for (let j = 0; j < keysLen; j++) {
                let keyForReg = keys[j].match(/\w+.*?=/)[0];
                let key = keyForReg.match(/\w+/)[0];
                let keyRegEx = new RegExp(`${keyForReg}(.*?)$`, "m");

                if (blah.indexOf(key) < 0) blah.push(key);

                if (key !== "event") {
                    actionObj[key] = action.match(keyRegEx)[1];
                }
            }
            
            formatObjArr.push(actionObj);
        }
    } else {
        unreleased = "TRUE";
    }

    if (!dbUnreleased || dbUnreleased !== unreleased) {
        let i = retObj.valuesArr.length + 1;

        retObj.caseArr.push(`WHEN name = $${i} THEN ${unreleased}`);
        retObj.nameArr.push(`$${i}`);
        retObj.valuesArr.push(character);
    }
}

function updateUnreleasedColumn(updateUnreleasedArrsObj) {
    let updateUnreleasedQuery = {
        text: `\
            UPDATE ${CHARACTERSTABLE}\
            SET unreleased = (CASE :caseArr END),\
                last_updated = CURRENT_TIMESTAMP(0)\
            WHERE name IN (:nameArr)\
        `
    };

    if (updateUnreleasedArrsObj.valuesArr.length > 0) {
        updateUnreleasedQuery.text = updateUnreleasedQuery.text
            .replace(":caseArr", updateUnreleasedArrsObj.caseArr.join("\n"))
            .replace(":nameArr", updateUnreleasedArrsObj.nameArr.join(", "));
        updateUnreleasedQuery.values = updateUnreleasedArrsObj.valuesArr;
        db.runQuery(updateUnreleasedQuery).then(
            res => console.log(`UPDATE ${res.rowCount} rows in ${CHARACTERSTABLE}`)
        );
    }
}

function getInsertsArr(dbArr, wikiArr) {
    let insertsArr = [];

    for (let i = 0; i < wikiArr.length; i++) {
        let el = wikiArr[i];

        if (!dbArr.includes(el)) {
            insertsArr.push(el);
        }
    }

    return insertsArr;
}

function getDeletesArr(dbArr, wikiArr) {
    let deletesArr = [];

    for (let i = 0; i < dbArr.length; i++) {
        let el = dbArr[i];

        if (!wikiArr.includes(el)) {
            deletesArr.push(el);
        }
    }

    return deletesArr;
}

function errResponse(err) {
    console.log(err);
    db.end();
}
