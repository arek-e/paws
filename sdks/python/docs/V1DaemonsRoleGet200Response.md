# V1DaemonsRoleGet200Response


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**role** | **str** |  | 
**description** | **str** |  | 
**status** | **str** |  | 
**trigger** | [**V1DaemonsGet200ResponseDaemonsInnerTrigger**](V1DaemonsGet200ResponseDaemonsInnerTrigger.md) |  | 
**stats** | [**V1DaemonsGet200ResponseDaemonsInnerStats**](V1DaemonsGet200ResponseDaemonsInnerStats.md) |  | 
**governance** | [**V1DaemonsPostRequestGovernance**](V1DaemonsPostRequestGovernance.md) |  | 
**recent_sessions** | [**List[V1DaemonsRoleGet200ResponseRecentSessionsInner]**](V1DaemonsRoleGet200ResponseRecentSessionsInner.md) |  | 

## Example

```python
from paws_client.models.v1_daemons_role_get200_response import V1DaemonsRoleGet200Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsRoleGet200Response from a JSON string
v1_daemons_role_get200_response_instance = V1DaemonsRoleGet200Response.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsRoleGet200Response.to_json())

# convert the object into a dict
v1_daemons_role_get200_response_dict = v1_daemons_role_get200_response_instance.to_dict()
# create an instance of V1DaemonsRoleGet200Response from a dict
v1_daemons_role_get200_response_from_dict = V1DaemonsRoleGet200Response.from_dict(v1_daemons_role_get200_response_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


