"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const mapArtistToEventSchema = new mongoose_1.Schema({
    artistName: {
        type: String,
        required: true,
    },
    eventId: {
        type: String,
        required: true,
    },
});
exports.default = (0, mongoose_1.model)("MapArtistToEvent", mapArtistToEventSchema);
//# sourceMappingURL=MapArtistToEvent.js.map