# V1DaemonsPostRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**role** | **str** |  | 
**description** | **str** |  | [optional] [default to '']
**snapshot** | **str** |  | 
**trigger** | [**V1DaemonsGet200ResponseDaemonsInnerTrigger**](V1DaemonsGet200ResponseDaemonsInnerTrigger.md) |  | 
**workload** | [**V1SessionsPostRequestWorkload**](V1SessionsPostRequestWorkload.md) |  | 
**resources** | [**V1SessionsPostRequestResources**](V1SessionsPostRequestResources.md) |  | [optional] 
**network** | [**V1SessionsPostRequestNetwork**](V1SessionsPostRequestNetwork.md) |  | [optional] 
**governance** | [**V1DaemonsPostRequestGovernance**](V1DaemonsPostRequestGovernance.md) |  | [optional] 

## Example

```python
from paws_client.models.v1_daemons_post_request import V1DaemonsPostRequest

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsPostRequest from a JSON string
v1_daemons_post_request_instance = V1DaemonsPostRequest.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsPostRequest.to_json())

# convert the object into a dict
v1_daemons_post_request_dict = v1_daemons_post_request_instance.to_dict()
# create an instance of V1DaemonsPostRequest from a dict
v1_daemons_post_request_from_dict = V1DaemonsPostRequest.from_dict(v1_daemons_post_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


