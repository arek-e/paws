# paws_client.FleetApi

All URIs are relative to _http://localhost_

| Method                                                       | HTTP request              | Description |
| ------------------------------------------------------------ | ------------------------- | ----------- |
| [**v1_fleet_get**](FleetApi.md#v1_fleet_get)                 | **GET** /v1/fleet         |
| [**v1_fleet_workers_get**](FleetApi.md#v1_fleet_workers_get) | **GET** /v1/fleet/workers |

# **v1_fleet_get**

> V1FleetGet200Response v1_fleet_get()

### Example

```python
import paws_client
from paws_client.models.v1_fleet_get200_response import V1FleetGet200Response
from paws_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = paws_client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with paws_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = paws_client.FleetApi(api_client)

    try:
        api_response = api_instance.v1_fleet_get()
        print("The response of FleetApi->v1_fleet_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling FleetApi->v1_fleet_get: %s\n" % e)
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**V1FleetGet200Response**](V1FleetGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description    | Response headers |
| ----------- | -------------- | ---------------- |
| **200**     | Fleet overview | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_fleet_workers_get**

> V1FleetWorkersGet200Response v1_fleet_workers_get()

### Example

```python
import paws_client
from paws_client.models.v1_fleet_workers_get200_response import V1FleetWorkersGet200Response
from paws_client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = paws_client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with paws_client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = paws_client.FleetApi(api_client)

    try:
        api_response = api_instance.v1_fleet_workers_get()
        print("The response of FleetApi->v1_fleet_workers_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling FleetApi->v1_fleet_workers_get: %s\n" % e)
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**V1FleetWorkersGet200Response**](V1FleetWorkersGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description     | Response headers |
| ----------- | --------------- | ---------------- |
| **200**     | List of workers | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
