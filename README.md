# Deno Craigslist 

This is a port of Joshua Thomas's [Node Craigslist](https://github.com/brozeph/node-craigslist) with types.

### Usage

```javascript
import { Client } from 'https://deno.land/x/craigslist/client.ts'

const client = new Client({
	city: 'louisville'
})

const listings = await client.list({
	category: 'cars+trucks',
	minYear: 2016,
	minPrice: 7_000,
	maxPrice: 10_000,
	searchDistance: 400,
})

const details = await client.details(listings[0])

console.log(listings[0])
console.log(details)
```

Running the example

```
deno run --allow-net example.ts
```