# V1SessionsIdGet200Response

## Properties

| Name             | Type                  | Description | Notes      |
| ---------------- | --------------------- | ----------- | ---------- |
| **session_id**   | **UUID**              |             |
| **status**       | **str**               |             |
| **exit_code**    | **int**               |             | [optional] |
| **stdout**       | **str**               |             | [optional] |
| **stderr**       | **str**               |             | [optional] |
| **output**       | **object**            |             | [optional] |
| **started_at**   | **datetime**          |             | [optional] |
| **completed_at** | **datetime**          |             | [optional] |
| **duration_ms**  | **int**               |             | [optional] |
| **worker**       | **str**               |             | [optional] |
| **metadata**     | **Dict[str, object]** |             | [optional] |

## Example

```python
from paws_client.models.v1_sessions_id_get200_response import V1SessionsIdGet200Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1SessionsIdGet200Response from a JSON string
v1_sessions_id_get200_response_instance = V1SessionsIdGet200Response.from_json(json)
# print the JSON string representation of the object
print(V1SessionsIdGet200Response.to_json())

# convert the object into a dict
v1_sessions_id_get200_response_dict = v1_sessions_id_get200_response_instance.to_dict()
# create an instance of V1SessionsIdGet200Response from a dict
v1_sessions_id_get200_response_from_dict = V1SessionsIdGet200Response.from_dict(v1_sessions_id_get200_response_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
