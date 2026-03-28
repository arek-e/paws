# paws_client.HealthApi

All URIs are relative to _http://localhost_

| Method                                    | HTTP request    | Description |
| ----------------------------------------- | --------------- | ----------- |
| [**health_get**](HealthApi.md#health_get) | **GET** /health |

# **health_get**

> HealthGet200Response health_get()

### Example

```python
import paws_client
from paws_client.models.health_get200_response import HealthGet200Response
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
    api_instance = paws_client.HealthApi(api_client)

    try:
        api_response = api_instance.health_get()
        print("The response of HealthApi->health_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling HealthApi->health_get: %s\n" % e)
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**HealthGet200Response**](HealthGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description           | Response headers |
| ----------- | --------------------- | ---------------- |
| **200**     | Gateway health status | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
