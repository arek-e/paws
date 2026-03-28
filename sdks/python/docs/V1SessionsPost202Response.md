# V1SessionsPost202Response


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**session_id** | **UUID** |  | 
**status** | **str** |  | 

## Example

```python
from paws_client.models.v1_sessions_post202_response import V1SessionsPost202Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1SessionsPost202Response from a JSON string
v1_sessions_post202_response_instance = V1SessionsPost202Response.from_json(json)
# print the JSON string representation of the object
print(V1SessionsPost202Response.to_json())

# convert the object into a dict
v1_sessions_post202_response_dict = v1_sessions_post202_response_instance.to_dict()
# create an instance of V1SessionsPost202Response from a dict
v1_sessions_post202_response_from_dict = V1SessionsPost202Response.from_dict(v1_sessions_post202_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


