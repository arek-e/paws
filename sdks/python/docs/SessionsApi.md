# paws_client.SessionsApi

All URIs are relative to *http://localhost*

Method | HTTP request | Description
------------- | ------------- | -------------
[**v1_sessions_id_delete**](SessionsApi.md#v1_sessions_id_delete) | **DELETE** /v1/sessions/{id} | 
[**v1_sessions_id_get**](SessionsApi.md#v1_sessions_id_get) | **GET** /v1/sessions/{id} | 
[**v1_sessions_post**](SessionsApi.md#v1_sessions_post) | **POST** /v1/sessions | 


# **v1_sessions_id_delete**
> V1SessionsIdDelete200Response v1_sessions_id_delete(id)

### Example


```python
import paws_client
from paws_client.models.v1_sessions_id_delete200_response import V1SessionsIdDelete200Response
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
    api_instance = paws_client.SessionsApi(api_client)
    id = UUID('38400000-8cf0-11bd-b23e-10b96e4ef00d') # UUID | 

    try:
        api_response = api_instance.v1_sessions_id_delete(id)
        print("The response of SessionsApi->v1_sessions_id_delete:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling SessionsApi->v1_sessions_id_delete: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **UUID**|  | 

### Return type

[**V1SessionsIdDelete200Response**](V1SessionsIdDelete200Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Session cancelled |  -  |
**404** | Session not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_sessions_id_get**
> V1SessionsIdGet200Response v1_sessions_id_get(id)

### Example


```python
import paws_client
from paws_client.models.v1_sessions_id_get200_response import V1SessionsIdGet200Response
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
    api_instance = paws_client.SessionsApi(api_client)
    id = UUID('38400000-8cf0-11bd-b23e-10b96e4ef00d') # UUID | 

    try:
        api_response = api_instance.v1_sessions_id_get(id)
        print("The response of SessionsApi->v1_sessions_id_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling SessionsApi->v1_sessions_id_get: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **id** | **UUID**|  | 

### Return type

[**V1SessionsIdGet200Response**](V1SessionsIdGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Session details |  -  |
**404** | Session not found |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_sessions_post**
> V1SessionsPost202Response v1_sessions_post(v1_sessions_post_request=v1_sessions_post_request)

### Example


```python
import paws_client
from paws_client.models.v1_sessions_post202_response import V1SessionsPost202Response
from paws_client.models.v1_sessions_post_request import V1SessionsPostRequest
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
    api_instance = paws_client.SessionsApi(api_client)
    v1_sessions_post_request = paws_client.V1SessionsPostRequest() # V1SessionsPostRequest |  (optional)

    try:
        api_response = api_instance.v1_sessions_post(v1_sessions_post_request=v1_sessions_post_request)
        print("The response of SessionsApi->v1_sessions_post:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling SessionsApi->v1_sessions_post: %s\n" % e)
```



### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **v1_sessions_post_request** | [**V1SessionsPostRequest**](V1SessionsPostRequest.md)|  | [optional] 

### Return type

[**V1SessionsPost202Response**](V1SessionsPost202Response.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**202** | Session created and queued |  -  |
**400** | Validation error |  -  |
**503** | Capacity exhausted |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

