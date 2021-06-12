/**
 * Original author: Joshua Thomas
 *   https://github.com/brozeph/node-craigslist
 * Deno port: Kieran Gill
 */
// import { Request } from 'reqlib';
import { urlParse, cheerio } from './deps.ts';
import { CATEGORY_MAP } from './categories.ts'
import type { Posting, PostingDetailsPartial, ReplyDetails, ClientOpts, ClientInitOpts } from './types.ts'
import core from './core.ts';

const debugLog = (name: string) => (message: string) => console.debug(`[${name}]: ${message}`)

const
	debug = debugLog('craigslist'),
	DEFAULT_BASE_HOST = 'craigslist.org',
	DEFAULT_CATEGORY = 'sss',
	DEFAULT_CATEGORY_DETAILS_INDEX = 1,
	DEFAULT_NO_CACHE = 'no-cache',
	DEFAULT_PATH = '/search/',
	DEFAULT_QUERYSTRING = '?sort=rel',
	DEFAULT_REQUEST_OPTIONS = {
		hostname : '',
		path : '',
		secure : true
	},
	HEADER_CACHE_CONTROL = 'Cache-Control',
	HEADER_PRAGMA = 'Pragma',
	PROTOCOL_INSECURE = 'http:',
	PROTOCOL_SECURE = 'https:',
	QUERY_KEYS = [
		'bundleDuplicates',
		'category',
		'hasImage',
		'hasPic',
		'max_price',
		'min_price',
		'offset',
		'postal',
		'postedToday',
		'query',
		'searchDistance',
		'searchNearby',
		'searchTitlesOnly',
		'srcType'
	],
	QUERY_PARAM_AUTO_MAKE_MODEL = '&auto_make_model=',
	QUERY_PARAM_BUNDLE_DUPLICATES = '&bundleDuplicates=1',
	QUERY_PARAM_DOGS_OK = '&pets_dog=1',
	QUERY_PARAM_HAS_IMAGE = '&hasPic=1',
	QUERY_PARAM_MAX = '&max_price=',
	QUERY_PARAM_MAX_BATHROOMS = '&max_bathrooms=',
	QUERY_PARAM_MAX_BEDROOMS = '&max_bedrooms=',
	QUERY_PARAM_MAX_MILES = '&max_auto_miles=',
	QUERY_PARAM_MAX_SQFT = '&max_Sqft=',
	QUERY_PARAM_MAX_YEAR = '&max_auto_year=',
	QUERY_PARAM_MIN = '&min_price=',
	QUERY_PARAM_MIN_BATHROOMS = '&min_bathrooms=',
	QUERY_PARAM_MIN_BEDROOMS = '&min_bedrooms=',
	QUERY_PARAM_MIN_MILES = '&min_auto_miles=',
	QUERY_PARAM_MIN_SQFT = '&min_Sqft=',
	QUERY_PARAM_MIN_YEAR = '&min_auto_year=',
	QUERY_PARAM_OFFSET = '&s=',
	QUERY_PARAM_POSTAL = '&postal=',
	QUERY_PARAM_POSTED_TODAY = '&postedToday=1',
	QUERY_PARAM_QUERY = '&query=',
	QUERY_PARAM_SEARCH_DISTANCE = '&search_distance=',
	QUERY_PARAM_SEARCH_NEARBY = '&searchNearby=1',
	QUERY_PARAM_SEARCH_TITLES_ONLY = '&srchType=T',
	RE_HTML = /\.htm(l)?/i,
	RE_TAGS_MAP = /map/i;

/**
 * Accepts strong of HTML and parses that string to find key details.
 *
 * @param postingUrl - URL that details were loaded from
 * @param markup - Markup from the request to Craigslist
 * @returns {object} details - The processed details from the Craigslist posting
 **/
function _getPostingDetails (postingUrl: string, markup: string): PostingDetailsPartial {
	const $ = cheerio.load(markup)
	
	const attributes: Record<string, string> = {}
	let postedAt: Date
	let updatedAt: Date
	const description = ($('#postingbody').text() || '').trim()
	const mapUrl = $('div.mapbox p.mapaddress')
		.find('a')
		.attr('href')
	let pid = postingUrl
		.substring(postingUrl.search(/[0-9]*\.html/))
		.replace(/\.html/, '')
	const replyUrl = ($('#replylink').attr('href') || '').trim()
	const title = ($('#titletextonly').text() || '').trim()
	const url = postingUrl
	

	// populate posting info
	$('div.postinginfos').find('.postinginfo').each((_i, element) => {
		const infoType = $(element).text();

		// set pid (a backup to ripping it from the URL)
		if (/post\sid/i.test(infoType)) {
			pid = (infoType.split(/\:/)[1] || '').trim();
			return;
		}

		const datetime = $(element).find('time').attr('datetime')
		// set postedAt
		if (/posted/i.test(infoType) && datetime) {
			postedAt = new Date(datetime);
			return;
		}

		// set updatedAt
		if (/updated/i.test(infoType) && datetime) {
			updatedAt = new Date(datetime);
			return;
		}
	});

	// populate posting photos
	const images = $('#thumbs').find('a').get().map((element) => 
		($(element).attr('href') || '').trim()
	)

	// grab attributes if they exist
	$('div.mapAndAttrs')
		.find('p.attrgroup')
		.last()
		.children()
		.each((_i, element) => {
			if ($(element).is('span')) {
				const attribute = $(element).text().split(/:\s/);
				attributes[attribute[0].replace(/\s/g, '_')] = attribute[1];
			}
		});

	// populate attributes
	// TODO unsure why he had this in there
	// if (attributes && Object.keys(attributes).length) {
	// 	details.attributes = attributes;
	// }

	return {
		// @ts-ignore TODO deno believes this is a used-before-assigned
		postedAt,
		// @ts-ignore TODO deno believes this is a used-before-assigned
		updatedAt,
		images,
		title,
		url,
		pid,
		description,
		mapUrl,
		replyUrl,
		attributes,
	}
}



/**
 * Accepts string of HTML and parses that string to find all pertinent postings.
 *
 * @param {object} options - Request options used for the request to craigslist
 * @param {string} markup - Markup from the request to Craigslist
 * @returns {Array} postings - The processed and normalized array of postings
 **/
function _getPostings (options: { hostname: string, secure: boolean }, markup: string): Posting[] {
	const $ = cheerio.load(markup)
	const postings: Posting[] = []
	const secure = options.secure

	$('div.content')
		.find('.result-row')
		.each((_i, element) => {
			// introducing fix for #11 - Craigslist markup changed
			const _details = $(element)
				.find('.result-title')
				.attr('href')
			if (_details == null) {
				console.warn('Details is null, this may be an issue')
				return
			}
			const details = _details
					.split(/\//g)
					.filter((term) => term.length)
					.map((term) => term.split(RE_HTML)[0])
			// fix for #6 and #24
			const detailsUrl = urlParse($(element)
					.find('.result-title')
					.attr('href'));

			// ensure hostname and protocol are properly set
			detailsUrl.hostname = detailsUrl.hostname || options.hostname;
			detailsUrl.protocol = secure ? PROTOCOL_SECURE : PROTOCOL_INSECURE;

			const lat = $(element).attr('data-latitude')
			const lon = $(element).attr('data-longitude')
			const coordinates = (lat != null && lon != null) ? { lat, lon } : undefined

			const posting: Posting = {
				category : details[DEFAULT_CATEGORY_DETAILS_INDEX],
				coordinates,
				date : ($(element)
					.find('time')
					.attr('datetime') || '')
						.trim(),
				hasPic : RE_TAGS_MAP
					.test($(element)
						.find('.result-tags')
						.text() || ''),
				location : ($(element)
					.find('.result-hood')
					.text() || '')
					.trim(),
				pid : ($(element)
					.attr('data-pid') || '')
						.trim(),
				price : ($(element)
					.find('.result-meta .result-price')
					.text() || '')
						.replace(/^\&\#x0024\;/g, '')
						.trim(), // sanitize
				title : ($(element)
					.find('.result-title')
					.text() || '')
						.trim(),
				// TODO original was `detailsUrl.format()`
				url : detailsUrl.toString()
			};

			postings.push(posting);
		});

	return postings;
}

/**
 * Accepts strong of HTML and parses that string to find key details.
 *
 * @param {string} markup - Markup from the request to Craigslist
 * @returns {null} - Returns empty
 **/
function _getReplyDetails (markup: string): ReplyDetails {
	const $ = cheerio.load(markup)
	let contactName: string
	let email: string
	let phoneNumber: string

	$('div.reply_options').find('b').each((_i, element) => {
		const infoType = $(element).text().trim();

		// set contact name
		if (/contact\sname/i.test(infoType)) {
			$(element).next().find('li').each((_i, li) => {
				contactName = $(li).text().trim();
			});

			return;
		}

		// set phone number and email
		if (/call/i.test(infoType)) {
			$(element).parent().find('li').each((_i, li) => {
				const value = $(li).text().trim();

				// check for phone value (based on the emoji)
				if (/\u260E/.test(value)) {
					phoneNumber = value.substring(value.indexOf('('));
					return;
				}

				// check for email value (based on the @ symbol)
				if (/\@/.test(value)) {
					email = value;
				}
			});

			return;
		}
	});

	// @ts-ignore TODO deno believes this is a use-before-assign
	return { email, phoneNumber, contactName }
}

/**
 * Accepts options, iterates through the known acceptable keys from defaultOptions
 * and if found in input options, uses that. If not found in input options to method,
 * falls back to the options specified when the module was initialized. If not found
 * in initialization options, uses the default options setting. All keys provided in
 * the input options variable are retained.
 *
 * @param client - the client instance wrapping the Craigslist request
 * @param options - Input options for the web request
 * @param query - A querystring
 * @returns The coalesced result of options
 **/
function _getRequestOptions (client: Client, options: ClientOpts, query?: string): { headers: Record<string, string>, hostname: string, path: string, secure: boolean } {
	const requestOptions = JSON.parse(JSON.stringify(DEFAULT_REQUEST_OPTIONS));

	// ensure default options are set, even if omitted from input options
	requestOptions.hostname = [
		core.Validation.coalesce(options.city, client.options.city, ''),
		// introducing fix for #7
		core.Validation.coalesce(
			options.baseHost,
			client.options.baseHost,
			DEFAULT_BASE_HOST)
	].join('.');

	// preserve any extraneous input option keys (may have addition instructions for underlying request object)
	Object
		.keys(options)
		.forEach((key) => {
			if (
				!QUERY_KEYS.indexOf(key) 
				&& core.Validation.isEmpty(requestOptions[key]) 
				// @ts-ignore TODO type this correctly so this goes away
				&& core.Validation.isEmpty(DEFAULT_REQUEST_OPTIONS[key])
			) {
				// @ts-ignore TODO type this correctly so this goes away
				requestOptions[key] = options[key];
			}
		});

	// setup path
	if (core.Validation.isEmpty(requestOptions.path)) {
		requestOptions.path = DEFAULT_PATH;
	}

	// setup category
	requestOptions.path = [
		requestOptions.path,
		core.Validation.coalesce(options.category, DEFAULT_CATEGORY)].join('');

	// setup querystring
	requestOptions.path = [requestOptions.path, DEFAULT_QUERYSTRING].join('');

	// add search query (if specified)
	if (!core.Validation.isEmpty(query)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_QUERY,
			encodeURIComponent(query ?? '')].join('');
	}

	// add bundleDuplicates (if specified)
	if (options.bundleDuplicates) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_BUNDLE_DUPLICATES].join('');
	}

	// add hasPic (if specified)
	if (options.hasImage || options.hasPic) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_HAS_IMAGE].join('');
	}

	// add min price (if specified)
	if (!core.Validation.isEmpty(options.minPrice)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MIN,
			options.minPrice].join('');
	}

	// add max price (if specified)
	if (!core.Validation.isEmpty(options.maxPrice)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MAX,
			options.maxPrice].join('');
	}

	// add min year (if specified)
	if (!core.Validation.isEmpty(options.minYear)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MIN_YEAR,
			options.minYear].join('');
	}

	// add max year (if specified)
	if (!core.Validation.isEmpty(options.maxYear)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MAX_YEAR,
			options.maxYear].join('');
	}

	// add min miles (if specified)
	if (!core.Validation.isEmpty(options.minMiles)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MIN_MILES,
			options.minMiles].join('');
	}

	// add max miles (if specified)
	if (!core.Validation.isEmpty(options.maxMiles)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MAX_MILES,
			options.maxMiles].join('');
	}

	// add auto make model (if specified)
	if (!core.Validation.isEmpty(options.autoMakeModel)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_AUTO_MAKE_MODEL,
			options.autoMakeModel].join('');
	}

	// add postal (if specified)
	if (!core.Validation.isEmpty(options.postal)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_POSTAL,
			options.postal].join('');
	}

	// add postedToday (if specified)
	if (options.postedToday) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_POSTED_TODAY].join('');
	}

	// add searchDistance (if specified)
	if (!core.Validation.isEmpty(options.searchDistance)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_SEARCH_DISTANCE,
			options.searchDistance].join('');
	}

	// add searchNearby (if specified)
	if (options.searchNearby) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_SEARCH_NEARBY].join('');
	}

	// add searchTitlesOnly (if specified)
	if (options.searchTitlesOnly) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_SEARCH_TITLES_ONLY].join('');
	}
	// add max bedrooms (if specified)
	if (!core.Validation.isEmpty(options.maxBedrooms)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MAX_BEDROOMS,
			options.maxBedrooms].join('');
	}

	// add min bedrooms (if specified)
	if (!core.Validation.isEmpty(options.minBedrooms)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MIN_BEDROOMS,
			options.minBedrooms].join('');
	}

	// add max bathrooms(if specified)
	if (!core.Validation.isEmpty(options.maxBathrooms)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MAX_BATHROOMS,
			options.maxBathrooms].join('');
	}

	// add min bathrooms (if specified)
	if (!core.Validation.isEmpty(options.minBathrooms)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MIN_BATHROOMS,
			options.minBathrooms].join('');
	}

	// add max square ft (if specified)
	if (!core.Validation.isEmpty(options.maxSqft)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MAX_SQFT,
			options.maxSqft].join('');
	}

	// add min square ft (if specified)
	if (!core.Validation.isEmpty(options.minSqft)) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_MIN_SQFT,
			options.minSqft].join('');
	}
		
	// add dogs ok (if specified)
	if (options.dogsOk) {
		requestOptions.path = [
			requestOptions.path,
			QUERY_PARAM_DOGS_OK].join('');
	}

	// add offset (if specified)
	if (options.offset) {
		requestOptions.path = [requestOptions.path, QUERY_PARAM_OFFSET, options.offset].join('');
	}

	// add cache control headers (if nocache is specified)
	if (options.nocache) {
		// ensure we have headers...
		requestOptions.headers = requestOptions.headers || {};

		// add headers to attempt to override cache controls
		requestOptions.headers[HEADER_CACHE_CONTROL] = DEFAULT_NO_CACHE;
		requestOptions.headers[HEADER_PRAGMA] = DEFAULT_NO_CACHE;
	}

	debug(`setting request options: ${JSON.stringify(requestOptions)}`);

	return requestOptions;
}

export type PostingDetails = PostingDetailsPartial & { replyDetails?: ReplyDetails }

export class Client {
	options: ClientInitOpts = {}
	replyUrl?: string

	constructor (options: ClientInitOpts & { replyUrl?: string }) {
		this.options = options || {};
		this.replyUrl = options.replyUrl;
	}

	async details (posting: string | { url: string }): Promise<PostingDetails> {
		if (core.Validation.isEmpty(posting)) {
			throw new Error('posting URL is required')
		}

		if (typeof posting !== 'string' && core.Validation.isEmpty(posting.url)) {
			throw new Error('posting URL is required')
		}

		const postingUrl = typeof posting === 'string' ? posting : posting.url;
		const opts: URL = urlParse(postingUrl)
		const requestOptions: URL & { secure: boolean } = Object.assign(opts, { secure: /https/i.test(opts.protocol) })

		debug(`request options set to: ${JSON.stringify(requestOptions)}`);

		const response = await fetch(requestOptions)
		const markup = await response.text()
		debug(`retrieved posting ${posting}. Getting details...`);
		const details = _getPostingDetails(postingUrl, markup);

		const _replyUrl = details.replyUrl ? details.replyUrl : this.replyUrl;
		if (!_replyUrl) {
			return details
		}

		const replyUrl = urlParse(_replyUrl);

		if (!replyUrl.hostname) {
			replyUrl.hostname = requestOptions.hostname;
			replyUrl.protocol = requestOptions.secure ? PROTOCOL_SECURE : PROTOCOL_INSECURE;
		}

		const value = await fetch(replyUrl)
		const replyDetailsMarkup = await value.text()
		const replyDetails = _getReplyDetails(replyDetailsMarkup);

		return {
			...details,
			replyDetails,
			replyUrl,
		}
	}

	list (options: ClientOpts): Promise<Posting[]> {
		return this.search(options, undefined)
	}

	async search (options: ClientOpts, query?: string): Promise<Posting[]> {
		if (core.Validation.isEmpty(query) && typeof options === 'string') {
			query = options;
			options = {};
		}

		// ensure options is at least a blank object before continuing
		options = options || {};
		// @ts-ignore
		options.category = CATEGORY_MAP[options.category ?? 'all']

		// remap options for the request
		const requestOptions = _getRequestOptions(this, options, query);

		debug(`Request options set to: ${JSON.stringify(requestOptions)}`);

		if (core.Validation.isEmpty(requestOptions.hostname)) {
			throw new Error('unable to set hostname (check to see if city is specified)')
		}

		const protocol = requestOptions.secure ? 'https' : 'http'
		const url = `${protocol}://${requestOptions.hostname}${requestOptions.path}`
		
		debug(`Fetching url ${url}`)
		
		const response = await fetch(url, { headers: requestOptions.headers })
		const markup = await response.text()
		const postings = _getPostings(requestOptions, markup);

		debug(`Found ${postings.length} postings`);

		return postings
	}
}

export default { Client };