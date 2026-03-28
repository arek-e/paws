# paws_client.WebhooksApi

All URIs are relative to _http://localhost_

| Method                                                            | HTTP request                 | Description |
| ----------------------------------------------------------------- | ---------------------------- | ----------- |
| [**v1_webhooks_role_post**](WebhooksApi.md#v1_webhooks_role_post) | **POST** /v1/webhooks/{role} |

# **v1_webhooks_role_post**

> V1WebhooksRolePost202Response v1_webhooks_role_post(role)

### Example

```python
import paws_client
from paws_client.models.v1_webhooks_role_post202_response import V1WebhooksRolePost202Response
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
    api_instance = paws_client.WebhooksApi(api_client)
    role = 'role_example' # str |

    try:
        api_response = api_instance.v1_webhooks_role_post(role)
        print("The response of WebhooksApi->v1_webhooks_role_post:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling WebhooksApi->v1_webhooks_role_post: %s\n" % e)
```

### Parameters

| Name     | Type    | Description | Notes |
| -------- | ------- | ----------- | ----- |
| **role** | **str** |             |

### Return type

[**V1WebhooksRolePost202Response**](V1WebhooksRolePost202Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

### HTTP response details

| Status code | Description                       | Response headers |
| ----------- | --------------------------------- | ---------------- |
| **202**     | Webhook accepted, session created | -                |
| **404**     | Daemon not found                  | -                |
| **429**     | Rate limited                      | -                |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)
