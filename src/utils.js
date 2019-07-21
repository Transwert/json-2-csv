'use strict';

let constants = require('./constants.json'),
    _ = require('underscore');

const dateStringRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/;

module.exports = {
    isStringRepresentation,
    isDateRepresentation,
    computeSchemaDifferences,
    deepCopy,
    convert,
    isEmptyField,
    removeEmptyFields,
    getNCharacters,
    safeUnwind
};

/**
 * Build the options to be passed to the appropriate function
 * If a user does not provide custom options, then we use our default
 * If options are provided, then we set each valid key that was passed
 * @param opts {Object} options object
 * @return {Object} options object
 */
function buildOptions(opts) {
    opts = _.defaults(opts || {}, constants.defaultOptions);

    // Note: _.defaults does a shallow default, we need to deep copy the DELIMITER object
    opts.delimiter = _.defaults(opts.delimiter, constants.defaultOptions.delimiter);

    // Otherwise, send the options back
    return opts;
}

/**
 * When promisified, the callback and options argument ordering is swapped, so
 * this function is intended to determine which argument is which and return
 * them in the correct order
 * @param arg1 {Object|Function} options or callback
 * @param arg2 {Object|Function} options or callback
 */
function parseArguments(arg1, arg2) {
    // If this was promisified (callback and opts are swapped) then fix the argument order.
    if (_.isObject(arg1) && !_.isFunction(arg1)) {
        return {
            options: arg1,
            callback: arg2
        };
    }
    // Regular ordering where the callback is provided before the options object
    return {
        options: arg2,
        callback: arg1
    };
}

/**
 * Validates the parameters passed in to json2csv and csv2json
 * @param config {Object} of the form: { data: {Any}, callback: {Function}, dataCheckFn: Function, errorMessages: {Object} }
 */
function validateParameters(config) {
    // If a callback wasn't provided, throw an error
    if (!config.callback) {
        throw new Error(constants.errors.callbackRequired);
    }

    // If we don't receive data, report an error
    if (!config.data) {
        config.callback(new Error(config.errorMessages.cannotCallOn + config.data + '.'));
        return false;
    }

    // The data provided data does not meet the type check requirement
    if (!config.dataCheckFn(config.data)) {
        config.callback(new Error(config.errorMessages.dataCheckFailure));
        return false;
    }

    // If we didn't hit any known error conditions, then the data is so far determined to be valid
    // Note: json2csv/csv2json may perform additional validity checks on the data
    return true;
}

/**
 * Abstracted function to perform the conversion of json-->csv or csv-->json
 * depending on the converter class that is passed via the params object
 * @param params {Object}
 */
function convert(params) {
    let {options, callback} = parseArguments(params.callback, params.options);
    options = buildOptions(options);

    let converter = new params.converter(options),

        // Validate the parameters before calling the converter's convert function
        valid = validateParameters({
            data: params.data,
            callback,
            errorMessages: converter.validationMessages,
            dataCheckFn: converter.validationFn
        });

    if (valid) converter.convert(params.data, callback);
}

/**
 * Utility function to deep copy an object, used by the module tests
 * @param obj
 * @returns {any}
 */
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Helper function that determines whether the provided value is a representation
 *   of a string. Given the RFC4180 requirements, that means that the value is
 *   wrapped in value wrap delimiters (usually a quotation mark on each side).
 * @param fieldValue
 * @param options
 * @returns {boolean}
 */
function isStringRepresentation(fieldValue, options) {
    const firstChar = fieldValue[0],
        lastIndex = fieldValue.length - 1,
        lastChar = fieldValue[lastIndex];

    // If the field starts and ends with a wrap delimiter
    return firstChar === options.delimiter.wrap && lastChar === options.delimiter.wrap;
}

/**
 * Helper function that determines whether the provided value is a representation
 *   of a date.
 * @param fieldValue
 * @returns {boolean}
 */
function isDateRepresentation(fieldValue) {
    return dateStringRegex.test(fieldValue);
}

/**
 * Helper function that determines the schema differences between two objects.
 * @param schemaA
 * @param schemaB
 * @returns {*}
 */
function computeSchemaDifferences(schemaA, schemaB) {
    return _.difference(schemaA, schemaB)
        .concat(_.difference(schemaB, schemaA));
}

/**
 * Utility function to check if a field is considered empty so that the emptyFieldValue can be used instead
 * @param fieldValue
 * @returns {boolean}
 */
function isEmptyField(fieldValue) {
    return _.isUndefined(fieldValue) || _.isNull(fieldValue) || fieldValue === '';
}

/**
 * Helper function that removes empty field values from an array.
 * @param fields
 * @returns {Array}
 */
function removeEmptyFields(fields) {
    return _.filter(fields, (field) => !isEmptyField(field));
}

/**
 * Helper function that retrieves the next n characters from the start index in
 *   the string including the character at the start index. This is used to
 *   check if are currently at an EOL value, since it could be multiple
 *   characters in length (eg. '\r\n')
 * @param str
 * @param start
 * @param n
 * @returns {string}
 */
function getNCharacters(str, start, n) {
    return str.substring(start, start + n);
}

/**
 * Performs a "safe" unwind on an array of documents with a given path
 * @param array
 * @param path
 */
function safeUnwind(array, path) {
    if (!array.length) { array = [array]; }

    if (path.includes('.')) {
        return unwindNestedPath(array, path);
    }
    return unwindPath(array, path);
}

function unwindPath(array, property) {
    return array.reduce(function (acc, curr) {
            // if the value at curr[prop] is not an array, just concat to acc
            if (!_.isArray(curr[property])) return [...acc, curr];

            return [...acc, ...curr[property].map((x) => ({ ...curr, [property]: x}))]
        },
        []);
}

function unwindNestedPath(array, path) {
    const splitPath = path.split('.'),
        property = splitPath.shift(),
        remainingPath = splitPath.join('.'),
        result = array.reduce((acc, curr) => {

            // if the value at curr[prop] is not an array, just concat to acc
            if (!_.isArray(curr[property])) return [...acc, curr];

            return [...acc, ...curr[property].map((x) =>
                    ({ ...curr, [property]: safeUnwind(x, remainingPath)}))]
        }, []);

    return safeUnwind(result, remainingPath);
}
