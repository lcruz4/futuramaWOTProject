var blah = ["name", "image", "quote?", "time", "currency", "xp", "requirements_level?", "requirements_building?", "animated", "requirements_character"];


var http = require("http");
var db = require("./db.js");
var basePath = "/api.php?action=query&format=json&";
var charactersRetrieved = false;

var options = {
  host: "futuramaworldsoftomorrow.gamepedia.com",
  path: `${basePath}list=categorymembers&cmtitle=Category:Characters&cmlimit=max`,
  headers: {
        "Api-User-Agent": "FuturamaWOTApplication/1.1 (http://www.luiscruzgmu.com; luiscruzgmu@gmail.com)"
    }
};

db.connect();
sendRequest();

function sendRequest() {
    http.request(options, handleResponse).end();
}

function handleResponse(response) {
    var str = "";
    
    //another chunk of data has been recieved, so append it to `str`
    response.on("data", chunk => str += chunk);

    //the whole response has been recieved, so we just print it out here
    response.on("end", () => {
        if (!/DDoS/.test(str)) {
            if (!charactersRetrieved) {
                handleCharactersResponse(str);
            } else {
                parseCharacterPage(str);
            }
        } else {
            console.log(str);
        }
    });
}

function handleCharactersResponse(str) {
    var obj = JSON.parse(str);
    var charArr = obj.query.categorymembers.map(obj => obj.title).filter(name => {
        return !/:|(?:How to Play)|(?:Characters)/i.test(name);
    });
    var charArrLen = charArr.length;
    var counter = 0;

    updateCharactersTable(charArr);

    // charactersRetrieved = true;
    // while (charArrLen > counter) {
    //     options.path = encodeURI(`${basePath}prop=revisions&rvprop=content&titles=${charArr.slice(counter, counter + 50).join("|")}`);
    //     sendRequest();
    //     counter += 50;
    // }
}

function updateCharactersTable(charArr) {
    db.runQuery({
        text: "SELECT name FROM characters;"
    })
    .then((res) => {
        let dbArr = res.rows.map(row => row.name);
        let insertsArr = getInsertsArr(dbArr, charArr);
        let deletesArr = getDeletesArr(dbArr, charArr);
        let insertsPromise = null;
        let deletesPromise = null;

        console.log(`${insertsArr.length} new characters to insert`);
        if (insertsArr.length > 0) {
            insertsPromise = db.insertCharacters(insertsArr).then(
                res => console.log(`${res.command} ${res.rowCount} rows into characters`),
                errResponse
            );
        }

        console.log(`${insertsArr.length} characters to delete`);
        if (deletesArr.length > 0) {
            deletesPromise = db.deleteCharacters(deletesArr).then(
                res => console.log(`${res.command} ${res.rowCount} rows from characters`),
                errResponse
            );
        }

        return Promise.all([insertsPromise, deletesPromise]);
    }, errResponse)
    .then(() => db.end());
}

function parseCharacterPage(str) {
    var pages = JSON.parse(str).query.pages;
    var pagesArr = Object.keys(pages).map(key => pages[key]);
    var pagesArrLen = pagesArr.length;

    for (var i = 0; i < pagesArrLen; i++) {
        console.log(formatCharacterPage(pagesArr[i].revisions[0]["*"]));
    }
}

function formatCharacterPage(input) {
    if (!/unreleased.*?=.*?yes/.test(input)) {
        var regExp = /{{Action(?:\n.*?)*}}/g;
        var actionsArr = input.match(regExp);
        var actionsArrLen = actionsArr.length;
        var formatObjArr = [];

        for (var i = 0; i < actionsArrLen; i++) {
            var action = actionsArr[i];
            var actionObj = {};
            var keys = action.match(/\|.*?\w+.*?=/g);
            var keysLen = keys.length;

            for (var j = 0; j < keysLen; j++) {
                var keyForReg = keys[j].match(/\w+.*?=/)[0];
                var key = keyForReg.match(/\w+/)[0];
                var keyRegEx = new RegExp(`${keyForReg}(.*?)$`, "m");

                if (blah.indexOf(key) < 0) blah.push(key);

                if (key !== "event") {
                    actionObj[key] = action.match(keyRegEx)[1];
                }
            }
            
            formatObjArr.push(actionObj);
        }

        return formatObjArr;
    } else {
        return;
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
}
