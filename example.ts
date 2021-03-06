import { Client } from 'https://deno.land/x/craigslist/client.ts'

const client = new Client({
	city: 'louisville'
})

const listings = await client.list({
	minYear: 2016,
	minPrice: 7_000,
	maxPrice: 10_000,
	searchDistance: 400,
	category: 'cars+trucks',
	// TODO Unsure if this is working
	hasPic: true,
})

console.log(listings[0])

const details = await client.details(listings[0])
console.log(details)