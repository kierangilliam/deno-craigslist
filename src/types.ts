import { CATEGORY_MAP } from './categories.ts'

export interface PostingDetailsPartial {
	title: string
	url: string

	// TODO these may be optional?
	postedAt: Date
	updatedAt?: Date
	pid: string

	images: string[]
	description: string
	mapUrl?: string
	replyUrl: string | URL
	attributes: Record<string, string>
}

export interface Posting {
	// TODO unknown right now means unknown by me
	category: unknown
	date: string
	hasPic: boolean
	coordinates?: { lat: string, lon: string }
	location: string
	pid: string
	price: string
	title: string
	url: string
}

export interface ReplyDetails {
	email?: string
	contactName?: string
	phoneNumber?: string
}

export interface ClientOpts {
	// defines the city for the search (NOTE: this field is required by #list and #search when not specified in the constructor)
	city?: string 
	// allows for specification of the base domain (defaults to craigslist.org) to support other countries (i.e. for Canada, craigslist.ca)
	baseHost?: string 
	// allows for specification of the category (defaults to sss) to search in other categories
	// TODO type this
	category?: keyof typeof CATEGORY_MAP
	// applies appropriate headers on request to attempt to bypass any caches
	nocache?: string 

	// TODO no idea
	replyUrl?: string

	// maximum price
	maxPrice?: number 
	// minimum price
	minPrice?: number 
	postal?: string
	// Number of miles 
	searchDistance?: number
	searchTitlesOnly?: string
	maxBedrooms?: string
	minBedrooms?: string
	maxBathrooms?: string
	minBathrooms?: string
	maxSqft?: string
	minSqft?: string
	
	// maybe bools
	searchNearby?: string
	postedToday?: string
	dogsOk?: string
	hasImage?: boolean
	hasPic?: boolean

	offset?: string
	bundleDuplicates?: string
	minYear?: number
	maxYear?: number
	minMiles?: number
	maxMiles?: number
	autoMakeModel?: string
}

export type ClientInitOpts = Pick<ClientOpts, 'city' | 'baseHost' | 'category' | 'nocache'>