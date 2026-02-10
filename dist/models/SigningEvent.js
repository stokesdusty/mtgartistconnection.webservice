"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const signingEventSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: true,
    },
    state: {
        type: String,
        required: false,
        default: null,
        index: true, // Index for faster queries when finding events by state
    },
    startDate: {
        type: String,
        required: true,
    },
    endDate: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: false,
        default: null
    }
});
exports.default = (0, mongoose_1.model)("SigningEvent", signingEventSchema);
//# sourceMappingURL=SigningEvent.js.map