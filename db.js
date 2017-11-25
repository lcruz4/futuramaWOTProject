const { Client } = require("pg");
const dbConfig = require("./dbConfig.json")

let client;

function connect() {
    client = new Client(dbConfig);
    client.connect().then((err) => {
    if (err) {
        console.error('connection error', err.stack);
    } else {
        console.log('connection established');
    }
    });
    client.on("end", () => console.log("connection terminated"));
}

function end() {
    client.end().then(
        () => console.log("client has disconnected"),
        err => console.error("error during disconnection", err.stack)
    );
}

function insertCharacters(characters) {
    let valsStr = characters.map((character, i) => `($${i + 1})`).join(",");
    let queryText = `\
        INSERT INTO characters\
            (name)\
        VALUES ${valsStr}`;

    return runQuery({
        text: queryText,
        values: characters
    });
}

function deleteCharacters(characters) {
    let valsStr = characters.map((characters, i) => `$${i + 1}`).join(", ");
    let queryText = `\
        DELETE FROM characters\
        WHERE name IN (${valsStr})`;

    return runQuery({
        text: queryText,
        values: characters
    });
}

function runQuery(query) {
    return client.query(query);
}

module.exports = {
    connect: connect,
    end: end,
    insertCharacters: insertCharacters,
    deleteCharacters: deleteCharacters,
    runQuery: runQuery
};
