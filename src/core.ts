export class Validation {
	static coalesce (...args: unknown[]) {
		return Array
			.prototype
			.slice
			.call(args)
			.filter((value) => (!Validation.isEmpty(value)))[0];
	}

	static isEmpty (value: unknown) {
		return (value === null || [
			typeof value === 'undefined',
			typeof value === 'string' && !value.length,
			typeof value === 'number' && isNaN(value),
			Array.isArray(value) && !value.length,
			typeof value === 'object' &&
				value?.toString &&
				/^\[object\sObject\]$/.test(value.toString()) &&
				!Object.keys(value).length
		].some((result) => (result)));
	}
}

export default { Validation };