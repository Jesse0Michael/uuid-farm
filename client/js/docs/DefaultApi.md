# UuidFarm.DefaultApi

All URIs are relative to *https://uuid-farm.herokuapp.com/v1*

Method | HTTP request | Description
------------- | ------------- | -------------
[**adoptUUID**](DefaultApi.md#adoptUUID) | **POST** /uuids | Adopt UUID
[**getFarm**](DefaultApi.md#getFarm) | **GET** / | Get Farm Stats
[**getUUID**](DefaultApi.md#getUUID) | **GET** /uuids/{id} | Get UUID
[**getUUIDs**](DefaultApi.md#getUUIDs) | **GET** /uuids | Get UUIDs
[**surrenderUUID**](DefaultApi.md#surrenderUUID) | **POST** /uuids/{id} | Surrender UUID
[**updateUUID**](DefaultApi.md#updateUUID) | **PUT** /uuids/{id} | Update UUID



## adoptUUID

> Uuid adoptUUID()

Adopt UUID

Adopt a previously surrendered, not yet adopted, uuid at random.

### Example

```javascript
import UuidFarm from 'uuid_farm';

let apiInstance = new UuidFarm.DefaultApi();
apiInstance.adoptUUID((error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully. Returned data: ' + data);
  }
});
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Uuid**](Uuid.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## getFarm

> Farm getFarm()

Get Farm Stats

Returns farm statistics.

### Example

```javascript
import UuidFarm from 'uuid_farm';

let apiInstance = new UuidFarm.DefaultApi();
apiInstance.getFarm((error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully. Returned data: ' + data);
  }
});
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Farm**](Farm.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## getUUID

> Uuid getUUID(id)

Get UUID

Returns information on a uuid by its id. Rejects invalid and not found uuids.

### Example

```javascript
import UuidFarm from 'uuid_farm';

let apiInstance = new UuidFarm.DefaultApi();
let id = null; // String | uuid
apiInstance.getUUID(id, (error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully. Returned data: ' + data);
  }
});
```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | [**String**](.md)| uuid | 

### Return type

[**Uuid**](Uuid.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## getUUIDs

> [Uuid] getUUIDs()

Get UUIDs

Returns all uuids.

### Example

```javascript
import UuidFarm from 'uuid_farm';

let apiInstance = new UuidFarm.DefaultApi();
apiInstance.getUUIDs((error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully. Returned data: ' + data);
  }
});
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**[Uuid]**](Uuid.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## surrenderUUID

> Uuid surrenderUUID(id)

Surrender UUID

Adds a new uuid to the farm to become available for adoption. Rejects invalid or duplicate uuids.

### Example

```javascript
import UuidFarm from 'uuid_farm';

let apiInstance = new UuidFarm.DefaultApi();
let id = null; // String | uuid
apiInstance.surrenderUUID(id, (error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully. Returned data: ' + data);
  }
});
```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | [**String**](.md)| uuid | 

### Return type

[**Uuid**](Uuid.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## updateUUID

> Uuid updateUUID(id, opts)

Update UUID

Update uuid metadata. Rejects invalid or not found uuids.

### Example

```javascript
import UuidFarm from 'uuid_farm';

let apiInstance = new UuidFarm.DefaultApi();
let id = null; // String | uuid
let opts = {
  'uuid': new UuidFarm.Uuid() // Uuid | uuid
};
apiInstance.updateUUID(id, opts, (error, data, response) => {
  if (error) {
    console.error(error);
  } else {
    console.log('API called successfully. Returned data: ' + data);
  }
});
```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | [**String**](.md)| uuid | 
 **uuid** | [**Uuid**](Uuid.md)| uuid | [optional] 

### Return type

[**Uuid**](Uuid.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

