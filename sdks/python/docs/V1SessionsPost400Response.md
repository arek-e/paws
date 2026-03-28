# V1SessionsPost400Response


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**error** | [**V1SessionsPost400ResponseError**](V1SessionsPost400ResponseError.md) |  | 

## Example

```python
from paws_client.models.v1_sessions_post400_response import V1SessionsPost400Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1SessionsPost400Response from a JSON string
v1_sessions_post400_response_instance = V1SessionsPost400Response.from_json(json)
# print the JSON string representation of the object
print(V1SessionsPost400Response.to_json())

# convert the object into a dict
v1_sessions_post400_response_dict = v1_sessions_post400_response_instance.to_dict()
# create an instance of V1SessionsPost400Response from a dict
v1_sessions_post400_response_from_dict = V1SessionsPost400Response.from_dict(v1_sessions_post400_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


