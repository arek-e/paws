# paws_client.DaemonsApi

All URIs are relative to _http://localhost_

| Method                                                             | HTTP request                  | Description |
| ------------------------------------------------------------------ | ----------------------------- | ----------- |
| [**v1_daemons_get**](DaemonsApi.md#v1_daemons_get)                 | **GET** /v1/daemons           |
| [**v1_daemons_post**](DaemonsApi.md#v1_daemons_post)               | **POST** /v1/daemons          |
| [**v1_daemons_role_delete**](DaemonsApi.md#v1_daemons_role_delete) | **DELETE** /v1/daemons/{role} |
| [**v1_daemons_role_get**](DaemonsApi.md#v1_daemons_role_get)       | **GET** /v1/daemons/{role}    |
| [**v1_daemons_role_patch**](DaemonsApi.md#v1_daemons_role_patch)   | **PATCH** /v1/daemons/{role}  |

# **v1_daemons_get**

> V1DaemonsGet200Response v1_daemons_get()

### Example

```python
import paws_client
from paws_client.models.v1_daemons_get200_response import V1DaemonsGet200Response
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
    api_instance = paws_client.DaemonsApi(api_client)

    try:
        api_response = api_instance.v1_daemons_get()
        print("The response of DaemonsApi->v1_daemons_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling DaemonsApi->v1_daemons_get: %s\n" % e)
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**V1DaemonsGet200Response**](V1DaemonsGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description     | Response headers |
| ----------- | --------------- | ---------------- |
| **200**     | List of daemons | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_daemons_post**

> V1DaemonsPost201Response v1_daemons_post(v1_daemons_post_request=v1_daemons_post_request)

### Example

```python
import paws_client
from paws_client.models.v1_daemons_post201_response import V1DaemonsPost201Response
from paws_client.models.v1_daemons_post_request import V1DaemonsPostRequest
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
    api_instance = paws_client.DaemonsApi(api_client)
    v1_daemons_post_request = paws_client.V1DaemonsPostRequest() # V1DaemonsPostRequest |  (optional)

    try:
        api_response = api_instance.v1_daemons_post(v1_daemons_post_request=v1_daemons_post_request)
        print("The response of DaemonsApi->v1_daemons_post:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling DaemonsApi->v1_daemons_post: %s\n" % e)
```

### Parameters

| Name                        | Type                                                | Description | Notes      |
| --------------------------- | --------------------------------------------------- | ----------- | ---------- |
| **v1_daemons_post_request** | [**V1DaemonsPostRequest**](V1DaemonsPostRequest.md) |             | [optional] |

### Return type

[**V1DaemonsPost201Response**](V1DaemonsPost201Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description           | Response headers |
| ----------- | --------------------- | ---------------- |
| **201**     | Daemon registered     | -                |
| **400**     | Validation error      | -                |
| **409**     | Daemon already exists | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_daemons_role_delete**

> V1DaemonsRoleDelete200Response v1_daemons_role_delete(role)

### Example

```python
import paws_client
from paws_client.models.v1_daemons_role_delete200_response import V1DaemonsRoleDelete200Response
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
    api_instance = paws_client.DaemonsApi(api_client)
    role = 'role_example' # str |

    try:
        api_response = api_instance.v1_daemons_role_delete(role)
        print("The response of DaemonsApi->v1_daemons_role_delete:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling DaemonsApi->v1_daemons_role_delete: %s\n" % e)
```

### Parameters

| Name     | Type    | Description | Notes |
| -------- | ------- | ----------- | ----- |
| **role** | **str** |             |

### Return type

[**V1DaemonsRoleDelete200Response**](V1DaemonsRoleDelete200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Daemon stopped   | -                |
| **404**     | Daemon not found | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_daemons_role_get**

> V1DaemonsRoleGet200Response v1_daemons_role_get(role)

### Example

```python
import paws_client
from paws_client.models.v1_daemons_role_get200_response import V1DaemonsRoleGet200Response
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
    api_instance = paws_client.DaemonsApi(api_client)
    role = 'role_example' # str |

    try:
        api_response = api_instance.v1_daemons_role_get(role)
        print("The response of DaemonsApi->v1_daemons_role_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling DaemonsApi->v1_daemons_role_get: %s\n" % e)
```

### Parameters

| Name     | Type    | Description | Notes |
| -------- | ------- | ----------- | ----- |
| **role** | **str** |             |

### Return type

[**V1DaemonsRoleGet200Response**](V1DaemonsRoleGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Daemon detail    | -                |
| **404**     | Daemon not found | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_daemons_role_patch**

> V1DaemonsRoleGet200Response v1_daemons_role_patch(role, v1_daemons_role_patch_request=v1_daemons_role_patch_request)

### Example

```python
import paws_client
from paws_client.models.v1_daemons_role_get200_response import V1DaemonsRoleGet200Response
from paws_client.models.v1_daemons_role_patch_request import V1DaemonsRolePatchRequest
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
    api_instance = paws_client.DaemonsApi(api_client)
    role = 'role_example' # str |
    v1_daemons_role_patch_request = paws_client.V1DaemonsRolePatchRequest() # V1DaemonsRolePatchRequest |  (optional)

    try:
        api_response = api_instance.v1_daemons_role_patch(role, v1_daemons_role_patch_request=v1_daemons_role_patch_request)
        print("The response of DaemonsApi->v1_daemons_role_patch:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling DaemonsApi->v1_daemons_role_patch: %s\n" % e)
```

### Parameters

| Name                              | Type                                                          | Description | Notes      |
| --------------------------------- | ------------------------------------------------------------- | ----------- | ---------- |
| **role**                          | **str**                                                       |             |
| **v1_daemons_role_patch_request** | [**V1DaemonsRolePatchRequest**](V1DaemonsRolePatchRequest.md) |             | [optional] |

### Return type

[**V1DaemonsRoleGet200Response**](V1DaemonsRoleGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description      | Response headers |
| ----------- | ---------------- | ---------------- |
| **200**     | Daemon updated   | -                |
| **404**     | Daemon not found | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
