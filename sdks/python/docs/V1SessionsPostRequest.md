# V1SessionsPostRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**snapshot** | **str** |  | 
**workload** | [**V1SessionsPostRequestWorkload**](V1SessionsPostRequestWorkload.md) |  | 
**resources** | [**V1SessionsPostRequestResources**](V1SessionsPostRequestResources.md) |  | [optional] 
**timeout_ms** | **int** |  | [optional] [default to 600000]
**network** | [**V1SessionsPostRequestNetwork**](V1SessionsPostRequestNetwork.md) |  | [optional] 
**callback_url** | **str** |  | [optional] 
**metadata** | **Dict[str, object]** |  | [optional] 

## Example

```python
from paws_client.models.v1_sessions_post_request import V1SessionsPostRequest

# TODO update the JSON string below
json = "{}"
# create an instance of V1SessionsPostRequest from a JSON string
v1_sessions_post_request_instance = V1SessionsPostRequest.from_json(json)
# print the JSON string representation of the object
print(V1SessionsPostRequest.to_json())

# convert the object into a dict
v1_sessions_post_request_dict = v1_sessions_post_request_instance.to_dict()
# create an instance of V1SessionsPostRequest from a dict
v1_sessions_post_request_from_dict = V1SessionsPostRequest.from_dict(v1_sessions_post_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


