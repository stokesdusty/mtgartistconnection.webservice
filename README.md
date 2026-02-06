# MTG Artist Connection - Web Service

Backend API for tracking Magic: The Gathering artists, signing events, and card prices.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **API:** GraphQL (express-graphql)
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Scheduler:** node-cron for daily jobs

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with:
   ```
   PORT=8080
   MONGODB_PASSWORD=your_mongodb_password
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   npm start
   ```

## API Endpoints

### GraphQL: `POST /graphql`

Interactive GraphiQL interface available at `http://localhost:8080/graphql`

#### Queries

| Query | Description |
|-------|-------------|
| `artists` | Get all artists (sorted alphabetically) |
| `artistByName(name)` | Get a specific artist by name |
| `users` | Get all users |
| `signingEvent` | Get all signing events |
| `mapArtistToEvent` | Get all artist-event mappings |
| `mapArtistToEventByEventId(eventId)` | Get artists for a specific event |

#### Mutations

| Mutation | Description |
|----------|-------------|
| `signup(name, email, password)` | Register a new user |
| `login(email, password)` | Authenticate a user |
| `addArtist(name, ...)` | Add a new artist |
| `updateArtist(id, fieldName, valueToSet)` | Update an artist field |
| `deleteArtist(id)` | Delete an artist |
| `signingEvent(name, city, startDate, endDate, url)` | Create a signing event |
| `mapArtistToEvent(artistName, eventId)` | Add an artist to an event |

## Data Models

### Artist
Stores MTG artist information including:
- Contact info (email, social media links)
- Signing availability and services
- Profile image filename

### SigningEvent
Tracks art signing events with name, city, dates, and URL.

### MapArtistToEvent
Links artists to signing events they're attending.

### CardPrice
Daily MTG card price data from Manapool API (~95k cards). Includes:
- Card identifiers (name, set_code, scryfall_id)
- Price data (regular, foil, etched, LP+, NM, market prices)
- Fetched timestamp

## Scheduled Jobs

### Price Sync (Daily at 3:00 AM)
Fetches card price data from `https://manapool.com/api/v1/prices/singles` and stores it in the `CardPrice` collection. Previous data is cleared before each sync.

## Project Structure

```
src/
├── app.ts                 # Express app entry point
├── handlers/
│   └── handlers.ts        # GraphQL schema and resolvers
├── models/
│   ├── Artist.ts          # Artist model
│   ├── CardPrice.ts       # Card price model
│   ├── MapArtistToEvent.ts
│   ├── SigningEvent.ts
│   └── User.ts
├── schema/
│   └── schema.ts          # GraphQL type definitions
├── services/
│   └── priceSyncService.ts # Daily price sync job
└── utils/
    └── connection.ts      # MongoDB connection
```
