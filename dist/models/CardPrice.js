"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const cardPriceSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    set_code: { type: String, required: true },
    number: { type: String },
    multiverse_id: { type: String },
    scryfall_id: { type: String },
    available_quantity: { type: Number },
    price_cents: { type: Number },
    price_cents_lp_plus: { type: Number },
    price_cents_nm: { type: Number },
    price_cents_foil: { type: Number },
    price_cents_lp_plus_foil: { type: Number },
    price_cents_nm_foil: { type: Number },
    price_cents_etched: { type: Number },
    price_cents_lp_plus_etched: { type: Number },
    price_cents_nm_etched: { type: Number },
    price_market: { type: Number },
    price_market_foil: { type: Number },
    url: { type: String },
    fetchedAt: { type: Date, required: true, default: Date.now },
});
// Compound index for looking up specific cards
cardPriceSchema.index({ scryfall_id: 1, fetchedAt: -1 });
cardPriceSchema.index({ name: 1, set_code: 1, fetchedAt: -1 });
cardPriceSchema.index({ fetchedAt: -1 });
exports.default = (0, mongoose_1.model)("CardPrice", cardPriceSchema);
//# sourceMappingURL=CardPrice.js.map