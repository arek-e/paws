# paws_client.SnapshotsApi

All URIs are relative to _http://localhost_

| Method                                                                               | HTTP request                         | Description |
| ------------------------------------------------------------------------------------ | ------------------------------------ | ----------- |
| [**v1_snapshots_builds_job_id_get**](SnapshotsApi.md#v1_snapshots_builds_job_id_get) | **GET** /v1/snapshots/builds/{jobId} |
| [**v1_snapshots_get**](SnapshotsApi.md#v1_snapshots_get)                             | **GET** /v1/snapshots                |
| [**v1_snapshots_id_build_post**](SnapshotsApi.md#v1_snapshots_id_build_post)         | **POST** /v1/snapshots/{id}/build    |

# **v1_snapshots_builds_job_id_get**

> V1SnapshotsBuildsJobIdGet200Response v1_snapshots_builds_job_id_get(job_id)

### Example

```python
import paws_client
from paws_client.models.v1_snapshots_builds_job_id_get200_response import V1SnapshotsBuildsJobIdGet200Response
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
    api_instance = paws_client.SnapshotsApi(api_client)
    job_id = 'job_id_example' # str |

    try:
        api_response = api_instance.v1_snapshots_builds_job_id_get(job_id)
        print("The response of SnapshotsApi->v1_snapshots_builds_job_id_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling SnapshotsApi->v1_snapshots_builds_job_id_get: %s\n" % e)
```

### Parameters

| Name       | Type    | Description | Notes |
| ---------- | ------- | ----------- | ----- |
| **job_id** | **str** |             |

### Return type

[**V1SnapshotsBuildsJobIdGet200Response**](V1SnapshotsBuildsJobIdGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description         | Response headers |
| ----------- | ------------------- | ---------------- |
| **200**     | Build job status    | -                |
| **404**     | Build job not found | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_snapshots_get**

> V1SnapshotsGet200Response v1_snapshots_get()

### Example

```python
import paws_client
from paws_client.models.v1_snapshots_get200_response import V1SnapshotsGet200Response
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
    api_instance = paws_client.SnapshotsApi(api_client)

    try:
        api_response = api_instance.v1_snapshots_get()
        print("The response of SnapshotsApi->v1_snapshots_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling SnapshotsApi->v1_snapshots_get: %s\n" % e)
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**V1SnapshotsGet200Response**](V1SnapshotsGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description       | Response headers |
| ----------- | ----------------- | ---------------- |
| **200**     | List of snapshots | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **v1_snapshots_id_build_post**

> V1SnapshotsIdBuildPost202Response v1_snapshots_id_build_post(id, v1_snapshots_id_build_post_request=v1_snapshots_id_build_post_request)

### Example

```python
import paws_client
from paws_client.models.v1_snapshots_id_build_post202_response import V1SnapshotsIdBuildPost202Response
from paws_client.models.v1_snapshots_id_build_post_request import V1SnapshotsIdBuildPostRequest
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
    api_instance = paws_client.SnapshotsApi(api_client)
    id = 'id_example' # str |
    v1_snapshots_id_build_post_request = paws_client.V1SnapshotsIdBuildPostRequest() # V1SnapshotsIdBuildPostRequest |  (optional)

    try:
        api_response = api_instance.v1_snapshots_id_build_post(id, v1_snapshots_id_build_post_request=v1_snapshots_id_build_post_request)
        print("The response of SnapshotsApi->v1_snapshots_id_build_post:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling SnapshotsApi->v1_snapshots_id_build_post: %s\n" % e)
```

### Parameters

| Name                                   | Type                                                                  | Description | Notes      |
| -------------------------------------- | --------------------------------------------------------------------- | ----------- | ---------- |
| **id**                                 | **str**                                                               |             |
| **v1_snapshots_id_build_post_request** | [**V1SnapshotsIdBuildPostRequest**](V1SnapshotsIdBuildPostRequest.md) |             | [optional] |

### Return type

[**V1SnapshotsIdBuildPost202Response**](V1SnapshotsIdBuildPost202Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json

### HTTP response details

| Status code | Description            | Response headers |
| ----------- | ---------------------- | ---------------- |
| **202**     | Snapshot build started | -                |
| **400**     | Validation error       | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
