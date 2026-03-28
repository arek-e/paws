# V1DaemonsRolePatchRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**description** | **str** |  | [optional] 
**trigger** | [**V1DaemonsGet200ResponseDaemonsInnerTrigger**](V1DaemonsGet200ResponseDaemonsInnerTrigger.md) |  | [optional] 
**workload** | [**V1SessionsPostRequestWorkload**](V1SessionsPostRequestWorkload.md) |  | [optional] 
**resources** | [**V1SessionsPostRequestResources**](V1SessionsPostRequestResources.md) |  | [optional] 
**network** | [**V1SessionsPostRequestNetwork**](V1SessionsPostRequestNetwork.md) |  | [optional] 
**governance** | [**V1DaemonsPostRequestGovernance**](V1DaemonsPostRequestGovernance.md) |  | [optional] 

## Example

```python
from paws_client.models.v1_daemons_role_patch_request import V1DaemonsRolePatchRequest

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsRolePatchRequest from a JSON string
v1_daemons_role_patch_request_instance = V1DaemonsRolePatchRequest.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsRolePatchRequest.to_json())

# convert the object into a dict
v1_daemons_role_patch_request_dict = v1_daemons_role_patch_request_instance.to_dict()
# create an instance of V1DaemonsRolePatchRequest from a dict
v1_daemons_role_patch_request_from_dict = V1DaemonsRolePatchRequest.from_dict(v1_daemons_role_patch_request_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


