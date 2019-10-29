/**
 * uuid farm
 * A farm for abandoned UUIDs
 *
 * The version of the OpenAPI document: v1
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 *
 */

import ApiClient from '../ApiClient';

/**
 * The Farm model module.
 * @module model/Farm
 * @version v1
 */
class Farm {
    /**
     * Constructs a new <code>Farm</code>.
     * @alias module:model/Farm
     * @param uuids {Number} 
     * @param adopted {Number} 
     * @param surrendered {Number} 
     */
    constructor(uuids, adopted, surrendered) { 
        
        Farm.initialize(this, uuids, adopted, surrendered);
    }

    /**
     * Initializes the fields of this object.
     * This method is used by the constructors of any subclasses, in order to implement multiple inheritance (mix-ins).
     * Only for internal use.
     */
    static initialize(obj, uuids, adopted, surrendered) { 
        obj['uuids'] = uuids;
        obj['adopted'] = adopted;
        obj['surrendered'] = surrendered;
    }

    /**
     * Constructs a <code>Farm</code> from a plain JavaScript object, optionally creating a new instance.
     * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
     * @param {Object} data The plain JavaScript object bearing properties of interest.
     * @param {module:model/Farm} obj Optional instance to populate.
     * @return {module:model/Farm} The populated <code>Farm</code> instance.
     */
    static constructFromObject(data, obj) {
        if (data) {
            obj = obj || new Farm();

            if (data.hasOwnProperty('uuids')) {
                obj['uuids'] = ApiClient.convertToType(data['uuids'], 'Number');
            }
            if (data.hasOwnProperty('adopted')) {
                obj['adopted'] = ApiClient.convertToType(data['adopted'], 'Number');
            }
            if (data.hasOwnProperty('surrendered')) {
                obj['surrendered'] = ApiClient.convertToType(data['surrendered'], 'Number');
            }
        }
        return obj;
    }


}

/**
 * @member {Number} uuids
 */
Farm.prototype['uuids'] = undefined;

/**
 * @member {Number} adopted
 */
Farm.prototype['adopted'] = undefined;

/**
 * @member {Number} surrendered
 */
Farm.prototype['surrendered'] = undefined;






export default Farm;
