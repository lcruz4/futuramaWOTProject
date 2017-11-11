var blah = ["character", "name", "image", "name", "quote", "time", "currency", "xp", "requirements_level", "requirements_building", "animated", "requirements_character"];
function formatInput(input) {
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

                if (key === "event") {
                    // console.log(`!!!!!${key}: ${action.match(keyRegEx)[1]}!!!!!`);
                } else {
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

var http = require("http");
var basePath = "/api.php?action=query&format=json&";
var flag = true;

var options = {
  host: "futuramaworldsoftomorrow.gamepedia.com",
  path: `${basePath}list=categorymembers&cmtitle=Category:Characters&cmlimit=max`
};
test();

function test() {
    http.request(options, callback).end();
}

function callback(response) {
    var str = "";
    
    //another chunk of data has been recieved, so append it to `str`
    response.on("data", function (chunk) {
        str += chunk;
    });

    //the whole response has been recieved, so we just print it out here
    response.on("end", function () {
        if (flag) {
            continueFunc(str);
        } else {
            otherFunc(str);
        }
    });
}

function continueFunc(str) {
    var obj = JSON.parse(str);
    var charArr = obj.query.categorymembers.map(obj => obj.title).filter(name => {
        return !/:|(?:How to Play)|(?:Characters)/i.test(name);
    });
    var charArrLen = charArr.length;
    var counter = 0;

    while (charArrLen > counter) {
        options.path = encodeURI(`${basePath}prop=revisions&rvprop=content&titles=${charArr.slice(counter, counter + 50).join("|")}`);
        flag = false;
        test();
        counter += 50;
    }
}

function otherFunc(str) {
    var pages = JSON.parse(str).query.pages;
    var pagesArr = Object.keys(pages).map(key => pages[key]);
    var pagesArrLen = pagesArr.length;

    for (var i = 0; i < pagesArrLen; i++) {
        console.log(formatInput(pagesArr[i].revisions[0]["*"]));
    }
}