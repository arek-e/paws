# V1SessionsPostRequestResources

## Properties

| Name          | Type    | Description | Notes                        |
| ------------- | ------- | ----------- | ---------------------------- |
| **vcpus**     | **int** |             | [optional] [default to 2]    |
| **memory_mb** | **int** |             | [optional] [default to 4096] |

## Example

```python
from paws_client.models.v1_sessions_post_request_resources import V1SessionsPostRequestResources

# TODO update the JSON string below
json = "{}"
# create an instance of V1SessionsPostRequestResources from a JSON string
v1_sessions_post_request_resources_instance = V1SessionsPostRequestResources.from_json(json)
# print the JSON string representation of the object
print(V1SessionsPostRequestResources.to_json())

# convert the object into a dict
v1_sessions_post_request_resources_dict = v1_sessions_post_request_resources_instance.to_dict()
# create an instance of V1SessionsPostRequestResources from a dict
v1_sessions_post_request_resources_from_dict = V1SessionsPostRequestResources.from_dict(v1_sessions_post_request_resources_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
