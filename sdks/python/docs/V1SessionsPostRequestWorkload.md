# V1SessionsPostRequestWorkload

## Properties

| Name       | Type               | Description | Notes      |
| ---------- | ------------------ | ----------- | ---------- |
| **type**   | **str**            |             |
| **script** | **str**            |             |
| **env**    | **Dict[str, str]** |             | [optional] |

## Example

```python
from paws_client.models.v1_sessions_post_request_workload import V1SessionsPostRequestWorkload

# TODO update the JSON string below
json = "{}"
# create an instance of V1SessionsPostRequestWorkload from a JSON string
v1_sessions_post_request_workload_instance = V1SessionsPostRequestWorkload.from_json(json)
# print the JSON string representation of the object
print(V1SessionsPostRequestWorkload.to_json())

# convert the object into a dict
v1_sessions_post_request_workload_dict = v1_sessions_post_request_workload_instance.to_dict()
# create an instance of V1SessionsPostRequestWorkload from a dict
v1_sessions_post_request_workload_from_dict = V1SessionsPostRequestWorkload.from_dict(v1_sessions_post_request_workload_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
